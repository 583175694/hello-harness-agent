import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { ReasoningCapability } from '@harness/agent-protocol';

import { ENV_KEYS } from '../bootstrap/env.constants';
import { ModelAdapter } from './model-adapter';
import { getConfiguredModel } from './model-catalog';
import type {
  ModelMessage,
  ModelRoundEvent,
  ModelRoundInput,
  ModelToolCall,
} from './model-adapter';

type DeepSeekDelta = { reasoning_content?: string };
type DeepSeekAssistantMessage = ChatCompletionMessageParam & { reasoning_content?: string };
type ProviderUsage = NonNullable<ChatCompletionChunk['usage']> & {
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

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

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    super();
  }

  profile(model: string): {
    provider: string;
    reasoningFormat?: string;
    reasoning: ReasoningCapability;
  } {
    const configured = getConfiguredModel(model);
    if (!configured) throw new Error(`MODEL_UNSUPPORTED:${model}`);
    return {
      provider: configured.provider,
      ...(configured.reasoningFormat ? { reasoningFormat: configured.reasoningFormat } : {}),
      reasoning: configured.reasoning,
    };
  }

  // 调用 OpenAI-compatible 流接口，并把供应商 chunk 归一化为一个 Model Round。
  // Chat Completions 没有 Content/Tool Call 共用的全局 index，因此按 Block 首次出现顺序
  // 分配 blockSequence；Tool Call 自身仍按 provider index 聚合和恢复声明顺序。
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
      messages: this.toProviderMessages(input.messages),
      ...(input.tools
        ? { tools: this.toProviderTools(input.tools), tool_choice: 'auto' as const }
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

    const calls = [...pendingCalls.entries()]
      // 供应商可能交错返回多个工具调用，结束时恢复模型声明的原始顺序。
      .sort(([left], [right]) => left - right)
      .map(([, call]) => call);
    if (calls.length) yield { type: 'tool_calls.completed', calls };
    yield {
      type: 'round.completed',
      finishReason,
      usage: {
        promptTokens,
        completionTokens,
        cachedTokens,
        // 供应商消息 framing 不公开；本字段只表示确定性的本地近似，不能代替 Usage。
        estimatedPromptTokens: this.estimatePromptTokens(request.messages, request.tools),
      },
    };
  }

  // 执行一次非流式文本生成，供标题等轻量任务复用。
  async generateText(model: string, messages: ModelMessage[]): Promise<string> {
    const configured = getConfiguredModel(model);
    const response = await this.getClient(model).chat.completions.create({
      model,
      messages: this.toProviderMessages(messages),
      ...(configured?.request.temperature !== undefined
        ? { temperature: configured.request.temperature }
        : {}),
      ...(configured?.request.maxTokens !== undefined
        ? { max_tokens: configured.request.maxTokens }
        : {}),
    });
    return response.choices[0]?.message.content ?? '';
  }

  // 将 canonical 消息转换为 OpenAI Chat Completions 消息。
  private toProviderMessages(messages: ModelMessage[]): ChatCompletionMessageParam[] {
    return messages.map((message): ChatCompletionMessageParam => {
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
      return { role: message.role, content: message.content };
    });
  }

  // 将应用工具声明转换为 OpenAI Function Calling 声明。
  private toProviderTools(tools: ModelRoundInput['tools']): ChatCompletionTool[] | undefined {
    return tools?.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  private estimatePromptTokens(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
  ): number {
    const serialized = JSON.stringify({ messages, tools: tools ?? [] });
    // 只作为供应商 Usage 缺失时的诊断近似；不能用于 Context Window 安全边界。
    return Math.ceil(Array.from(serialized).length / 4);
  }

  // 延迟创建客户端，保证未配置模型时 API 仍可启动并返回明确错误。
  private getClient(model?: string): OpenAI {
    const configured = model ? getConfiguredModel(model) : undefined;
    const baseUrl = configured?.baseUrl ?? 'https://api.openai.com/v1';
    if (!this.client || (this.clientBaseUrl && this.clientBaseUrl !== baseUrl)) {
      this.client = new OpenAI({
        apiKey: this.config.getOrThrow<string>(ENV_KEYS.openAiApiKey),
        baseURL: baseUrl,
      });
      this.clientBaseUrl = baseUrl;
    }
    return this.client;
  }
}
