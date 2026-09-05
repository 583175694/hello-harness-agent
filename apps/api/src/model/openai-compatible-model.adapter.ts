import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { ReasoningCapability } from '@harness/agent-protocol';
import { getDeepSeekV3TokenEstimator, type DeepSeekMessage } from '@harness/deepseek-v3-tokenizer';

import { ENV_KEYS } from '../bootstrap/env.constants';
import { ModelAdapter } from './model-adapter';
import { getConfiguredModel } from './model-catalog';
import type {
  ModelMessage,
  ModelRoundEvent,
  ModelRoundInput,
  ModelToolCall,
} from './model-adapter';
import { clarificationRequestSchema } from '@harness/agent-protocol';
import { FilesService } from '../files/files.service';

const CLARIFICATION_CONTROL_NAME = 'request_clarification';
const CLARIFICATION_CONTROL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: CLARIFICATION_CONTROL_NAME,
    description: '仅当缺少必须由用户提供且无法安全推断的信息时，请求用户澄清。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        allowFreeText: { type: 'boolean' },
      },
      required: ['question', 'allowFreeText'],
    },
  },
};

type DeepSeekDelta = { reasoning_content?: string };
type DeepSeekAssistantMessage = ChatCompletionMessageParam & { reasoning_content?: string };
type ProviderUsage = NonNullable<ChatCompletionChunk['usage']> & {
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

// 将供应商返回的 token 统计统一为运行时使用的字段，并保留未知值为空。
export function normalizeProviderUsage(usage: ProviderUsage): {
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
} {
  return {
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    // DeepSeek 把缓存命中放在顶层；OpenAI-compatible Provider 也可能使用 details。
    cachedTokens:
      usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? null,
  };
}

@Injectable()
export class OpenAICompatibleModelAdapter extends ModelAdapter {
  private client?: OpenAI;
  private clientBaseUrl?: string;
  private readonly tokenEstimator = getDeepSeekV3TokenEstimator();

  // 可选注入 FilesService，便于纯文本调用和不带附件的测试环境运行。
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Optional() @Inject(FilesService) private readonly files?: FilesService,
  ) {
    super();
  }

  // 返回模型目录中的能力声明，供 Run 和 Adapter 双重校验请求。
  profile(model: string): {
    provider: string;
    reasoningFormat?: string;
    reasoning: ReasoningCapability;
    supportsVision?: boolean;
  } {
    const configured = getConfiguredModel(model);
    if (!configured) throw new Error(`MODEL_UNSUPPORTED:${model}`);
    return {
      provider: configured.provider,
      ...(configured.reasoningFormat ? { reasoningFormat: configured.reasoningFormat } : {}),
      reasoning: configured.reasoning,
      supportsVision: configured.supportsVision,
    };
  }

  // 调用 OpenAI-compatible 流接口，并把供应商 chunk 归一化为一个 Model Round。
  // Chat Completions 没有 Content/Tool Call 共用的全局 index，因此按 Block 首次出现顺序
  // 分配 blockSequence；Tool Call 自身仍按 provider index 聚合和恢复声明顺序。
  // 调用 OpenAI-compatible 流接口并归一化文本、思考和工具调用事件。
  async *streamRound(input: ModelRoundInput): AsyncIterable<ModelRoundEvent> {
    const profile = this.profile(input.model);
    const configured = getConfiguredModel(input.model);
    if (!profile.reasoning.levels.includes(input.reasoningEffort as never)) {
      throw new Error(`REASONING_EFFORT_UNSUPPORTED:${input.model}:${input.reasoningEffort}`);
    }
    const request = {
      model: input.model,
      stream: true,
      stream_options: { include_usage: true },
      ...(configured?.request.temperature !== undefined
        ? { temperature: configured.request.temperature }
        : {}),
      ...(configured?.request.maxTokens !== undefined
        ? { max_tokens: configured.request.maxTokens }
        : {}),
      messages: await this.toProviderMessages(input.messages, input.model),
      ...(input.tools || input.allowClarification
        ? {
            tools: [
              ...(this.toProviderTools(input.tools) ?? []),
              ...(input.allowClarification ? [CLARIFICATION_CONTROL_TOOL] : []),
            ],
            tool_choice: 'auto' as const,
          }
        : {}),
      ...(profile.provider === 'deepseek'
        ? input.reasoningEffort === 'off'
          ? { thinking: { type: 'disabled' } }
          : {
              thinking: { type: 'enabled' },
              reasoning_effort: input.reasoningEffort,
            }
        : {}),
    };
    const response = (await this.getClient(input.model).chat.completions.create(
      request as Parameters<OpenAI['chat']['completions']['create']>[0],
      input.signal ? { signal: input.signal } : undefined,
    )) as Awaited<ReturnType<OpenAI['chat']['completions']['create']>> & AsyncIterable<unknown>;
    const pendingCalls = new Map<number, ModelToolCall>();
    let finishReason: string | null = null;
    let nextBlockSequence = 0;
    let contentBlockSequence: number | undefined;
    let reasoningBlockSequence: number | undefined;
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let cachedTokens: number | null = null;

    // 一个工具调用的名称和 JSON 参数可能跨多个 chunk，必须按 index 分组累积。
    for await (const rawChunk of response) {
      const chunk = rawChunk as ChatCompletionChunk;
      // OpenAI-compatible Provider 通常在 choices 为空的最后一个 chunk 返回 Usage。
      if (chunk.usage) {
        ({ promptTokens, completionTokens, cachedTokens } = normalizeProviderUsage(
          chunk.usage as ProviderUsage,
        ));
      }
      const choice = chunk.choices[0];
      if (!choice) continue;
      finishReason = choice.finish_reason ?? finishReason;
      const reasoning = (choice.delta as DeepSeekDelta).reasoning_content;
      if (reasoning) {
        reasoningBlockSequence ??= nextBlockSequence++;
        yield { type: 'reasoning.delta', delta: reasoning, blockSequence: reasoningBlockSequence };
      }
      if (choice.delta.content) {
        // 同一 Round 的连续 Content Delta 永远更新同一个稳定文本 Block。
        contentBlockSequence ??= nextBlockSequence++;
        yield {
          type: 'text.delta',
          delta: choice.delta.content,
          blockSequence: contentBlockSequence,
        };
      }
      for (const fragment of choice.delta.tool_calls ?? []) {
        // 第一次见到某个 Tool Call 时固定其业务位置，后续参数分片只原位聚合。
        const current = pendingCalls.get(fragment.index) ?? {
          id: '',
          name: '',
          arguments: '',
          blockSequence: nextBlockSequence++,
          providerIndex: fragment.index,
        };
        if (fragment.id) current.id = fragment.id;
        if (fragment.function?.name) current.name += fragment.function.name;
        if (fragment.function?.arguments) current.arguments += fragment.function.arguments;
        pendingCalls.set(fragment.index, current);
      }
    }

    const allCalls = [...pendingCalls.entries()]
      // 供应商可能交错返回多个工具调用，结束时恢复模型声明的原始顺序。
      .sort(([left], [right]) => left - right)
      .map(([, call]) => call);
    const clarificationCalls = allCalls.filter((call) => call.name === CLARIFICATION_CONTROL_NAME);
    const calls = allCalls.filter((call) => call.name !== CLARIFICATION_CONTROL_NAME);
    if (clarificationCalls.length > 1 || (clarificationCalls.length && calls.length))
      throw new Error('INVALID_CLARIFICATION_PROTOCOL');
    if (clarificationCalls[0])
      yield {
        type: 'clarification.completed',
        request: clarificationRequestSchema.parse(JSON.parse(clarificationCalls[0].arguments)),
      };
    if (calls.length) yield { type: 'tool_calls.completed', calls };
    yield {
      type: 'round.completed',
      finishReason,
      usage: {
        promptTokens,
        completionTokens,
        cachedTokens,
        // 供应商消息 framing 不公开；本字段只表示确定性的本地近似，不能代替 Usage。
        estimatedPromptTokens: await this.estimatePromptTokens(request.messages, request.tools),
      },
    };
  }

  // 执行一次非流式文本生成，供标题等轻量任务复用。
  // 执行非流式文本请求，主要供标题生成等内部调用使用。
  async generateText(
    model: string,
    messages: ModelMessage[],
    signal?: AbortSignal,
  ): Promise<string> {
    const configured = getConfiguredModel(model);
    const response = await this.getClient(model).chat.completions.create(
      {
        model,
        messages: await this.toProviderMessages(messages, model),
        ...(configured?.request.temperature !== undefined
          ? { temperature: configured.request.temperature }
          : {}),
        ...(configured?.request.maxTokens !== undefined
          ? { max_tokens: configured.request.maxTokens }
          : {}),
      },
      signal ? { signal } : undefined,
    );
    return response.choices[0]?.message.content ?? '';
  }

  // 将 canonical 消息转换为 OpenAI Chat Completions 消息。
  private async toProviderMessages(
    messages: ModelMessage[],
    model: string,
  ): Promise<ChatCompletionMessageParam[]> {
    return Promise.all(
      messages.map(async (message): Promise<ChatCompletionMessageParam> => {
        if (message.role === 'tool') {
          return { role: 'tool', content: message.content, tool_call_id: message.toolCallId };
        }
        if (message.role === 'assistant') {
          return {
            role: 'assistant',
            content: message.content,
            ...(message.reasoning && message.toolCalls?.length
              ? { reasoning_content: message.reasoning }
              : {}),
            tool_calls: message.toolCalls?.map((call) => ({
              id: call.id,
              type: 'function' as const,
              function: { name: call.name, arguments: call.arguments },
            })),
          } as DeepSeekAssistantMessage;
        }
        if (message.role === 'system') return { role: 'system', content: message.content };
        if (typeof message.content === 'string') return { role: 'user', content: message.content };
        if (!getConfiguredModel(model)?.supportsVision) throw new Error('MODEL_VISION_UNSUPPORTED');
        const content = await Promise.all(
          message.content.map(async (block) => {
            if (block.type === 'text') return { type: 'text' as const, text: block.text };
            if (!this.files) throw new Error('FILE_STORAGE_UNAVAILABLE');
            const url = await this.files.readUrlById(block.fileId);
            return {
              type: 'image_url' as const,
              image_url: { url, detail: block.detail ?? 'auto' },
            };
          }),
        );
        return { role: 'user', content } as ChatCompletionMessageParam;
      }),
    );
  }

  // 将应用工具声明转换为 OpenAI Function Calling 声明。
  private toProviderTools(tools: ModelRoundInput['tools']): ChatCompletionTool[] | undefined {
    return tools?.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  private async estimatePromptTokens(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
  ): Promise<number> {
    const tokenizerMessages: DeepSeekMessage[] = messages.map((message) => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant' as const,
          content: typeof message.content === 'string' ? message.content : null,
          toolCalls: message.tool_calls
            ?.filter(
              (call): call is Extract<typeof call, { type: 'function' }> =>
                call.type === 'function',
            )
            .map((call) => ({
              id: call.id,
              name: call.function.name,
              arguments: call.function.arguments,
              type: call.type,
            })),
        };
      }
      if (message.role === 'tool') {
        return {
          role: 'tool' as const,
          content: typeof message.content === 'string' ? message.content : '',
        };
      }
      if (message.role === 'developer') {
        return {
          role: 'system' as const,
          content: typeof message.content === 'string' ? message.content : '',
        };
      }
      return {
        role: message.role === 'function' ? ('tool' as const) : message.role,
        content: typeof message.content === 'string' ? message.content : '',
      } as DeepSeekMessage;
    });
    if (tools?.length) {
      tokenizerMessages.push({
        role: 'system',
        content: `<tool_definitions>${JSON.stringify(tools)}</tool_definitions>`,
      });
    }
    return this.tokenEstimator.countMessages(tokenizerMessages);
  }

  // 延迟创建客户端，保证未配置模型时 API 仍可启动并返回明确错误。
  private getClient(model?: string): OpenAI {
    const configured = model ? getConfiguredModel(model) : undefined;
    const baseUrl = configured?.baseUrl ?? 'https://api.openai.com/v1';
    const apiKey =
      configured?.provider === 'bailian'
        ? (this.config.get<string>(ENV_KEYS.bailianApiKey) ??
          this.config.getOrThrow<string>(ENV_KEYS.openAiApiKey))
        : this.config.getOrThrow<string>(ENV_KEYS.openAiApiKey);
    if (!this.client || (this.clientBaseUrl && this.clientBaseUrl !== baseUrl)) {
      this.client = new OpenAI({
        apiKey,
        baseURL: baseUrl,
      });
      this.clientBaseUrl = baseUrl;
    }
    return this.client;
  }
}
