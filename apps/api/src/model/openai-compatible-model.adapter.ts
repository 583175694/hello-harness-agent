import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import OpenAI from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import type { ReasoningCapability } from '@harness/agent-protocol';
import { getDeepSeekV3TokenEstimator, type DeepSeekMessage } from '@harness/deepseek-v3-tokenizer';

import { ENV_KEYS } from '../bootstrap/env.constants';
import { ModelAdapter } from './model-adapter';
import { getConfiguredModel } from './model-catalog';
import type {
  ModelFinishReason,
  ModelMessage,
  ModelRoundEvent,
  ModelRoundInput,
  ModelToolCall,
} from './model-adapter';
import { ModelProviderResponseError } from './model-adapter';
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

function normalizeFinishReason(reason: string | null | undefined): ModelFinishReason | null {
  if (!reason) return null;
  if (reason === 'stop') return 'stop';
  if (reason === 'tool_calls' || reason === 'function_call') return 'tool_calls';
  if (reason === 'length') return 'max_output_tokens';
  if (reason === 'content_filter') return 'content_filter';
  return 'unknown';
}

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
  // 延迟初始化的供应商客户端。
  private client?: OpenAI;
  // 当前客户端对应的基础地址，用于切换模型供应商时重建客户端。
  private clientBaseUrl?: string;
  // 用于估算模型请求输入 token 的本地 tokenizer。
  private readonly tokenEstimator = getDeepSeekV3TokenEstimator();

  // 可选注入 FilesService，便于纯文本调用和不带附件的测试环境运行。
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Optional() @Inject(FilesService) private readonly files?: FilesService,
    @Optional() @Inject(PinoLogger) private readonly logger?: PinoLogger,
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

  // 调用兼容 OpenAI 协议的流接口，并把供应商分片归一化为模型轮次事件。
  // 文本和工具调用分别维护稳定顺序，工具参数完整聚合后再交给 Runtime。
  async *streamRound(input: ModelRoundInput): AsyncIterable<ModelRoundEvent> {
    const profile = this.profile(input.model);
    const configured = getConfiguredModel(input.model);
    if (!profile.reasoning.levels.includes(input.reasoningEffort as never)) {
      throw new Error(`REASONING_EFFORT_UNSUPPORTED:${input.model}:${input.reasoningEffort}`);
    }
    if (configured?.api === 'responses') {
      yield* this.streamResponsesRound(input, configured);
      return;
    }
    const request = {
      model: input.model,
      stream: true,
      stream_options: { include_usage: true },
      ...(configured?.request.temperature !== undefined
        ? { temperature: configured.request.temperature }
        : {}),
      ...(input.maxOutputTokens ?? configured?.request.maxTokens
        ? { max_tokens: input.maxOutputTokens ?? configured?.request.maxTokens }
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
    let finishReason: ModelFinishReason | null = null;
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
      finishReason = normalizeFinishReason(choice.finish_reason) ?? finishReason;
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

  // DeepSeek Responses API 与 Chat Completions 使用不同的输入 item 和 SSE 事件；
  // 这里将两者归一化为同一个 ModelRoundEvent，Runtime 无需感知供应商线协议。
  private async *streamResponsesRound(
    input: ModelRoundInput,
    configured: NonNullable<ReturnType<typeof getConfiguredModel>>,
  ): AsyncIterable<ModelRoundEvent> {
    const responseInput = await this.toResponseInput(input.messages, input.model);
    const request: Record<string, unknown> = {
      model: input.model,
      input: responseInput,
      stream: true,
      max_output_tokens: input.maxOutputTokens ?? configured.request.maxTokens,
      ...(configured.request.temperature !== undefined
        ? { temperature: configured.request.temperature }
        : {}),
      ...(input.tools || input.allowClarification
        ? {
            tools: [
              ...(this.toResponseTools(input.tools) ?? []),
              ...(input.allowClarification ? [this.toResponseClarificationTool()] : []),
            ],
            tool_choice: 'auto',
          }
        : {}),
      // DeepSeek 的 Responses API 默认启用思考模式；off 必须显式映射为 none，
      // 省略 reasoning 字段会回退到供应商默认的 high。
      reasoning: {
        effort:
          input.reasoningEffort === 'off'
            ? 'none'
            : input.reasoningEffort === 'max'
              ? 'high'
              : input.reasoningEffort,
      },
    };
    // DeepSeek ignores stream_options; the OpenAI SDK accepts the request shape at runtime.
    const stream = (await this.getClient(input.model).responses.create(
      request as never,
      input.signal ? { signal: input.signal } : undefined,
    )) as unknown as AsyncIterable<ResponseStreamEvent>;
    const calls = new Map<number, ModelToolCall>();
    type MessageState = {
      outputIndex: number;
      phase: 'commentary' | 'final_answer' | null;
      emittedText: boolean;
    };
    const messageStates = new Map<string, MessageState>();
    let finishReason: ModelFinishReason | null = null;
    let incompleteReason: string | undefined;
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let cachedTokens: number | null = null;
    for await (const event of stream) {
      const value = event as unknown as Record<string, any>;
      if (configured.traceResponsesEvents) this.logResponseEvent(value);
      if (
        value.type === 'response.output_item.added' ||
        value.type === 'response.output_item.done'
      ) {
        const item = value.item as Record<string, any> | undefined;
        if (!item) continue;
        if (item.type === 'message') {
          const id = String(item.id ?? '');
          if (!id) continue;
          const state = messageStates.get(id) ?? {
            outputIndex: Number(value.output_index ?? 0),
            phase: null,
            emittedText: false,
          };
          // DeepSeek may advertise final_answer on `added` and correct it to
          // commentary on `done`; the latter is authoritative.
          if (value.type === 'response.output_item.done') {
            state.phase = item.phase ?? state.phase;
            if (
              state.emittedText &&
              (state.phase === 'commentary' || state.phase === 'final_answer')
            ) {
              yield {
                type: 'text.phase.completed',
                blockSequence: state.outputIndex,
                phase: state.phase,
              };
            }
          } else if (state.phase === null) {
            state.phase = item.phase ?? null;
          }
          messageStates.set(id, state);
        }
        if (item.type === 'function_call') {
          const index = Number(value.output_index ?? calls.size);
          const current = calls.get(index);
          calls.set(index, {
            id: String(item.call_id ?? item.id ?? current?.id ?? ''),
            name: String(item.name ?? current?.name ?? ''),
            arguments:
              value.type === 'response.output_item.done'
                ? String(item.arguments ?? current?.arguments ?? '')
                : (current?.arguments ?? String(item.arguments ?? '')),
            blockSequence: index,
            providerIndex: index,
          });
        }
        continue;
      }
      if (
        value.type === 'response.reasoning_text.delta' ||
        value.type === 'response.reasoning_summary_text.delta'
      ) {
        if (typeof value.delta === 'string')
          yield {
            type: 'reasoning.delta',
            delta: value.delta,
            blockSequence: Number(value.output_index ?? 0),
          };
        continue;
      }
      if (value.type === 'response.output_text.delta') {
        const itemId = value.item_id ? String(value.item_id) : '';
        const delta = String(value.delta ?? '');
        if (!delta) continue;
        const state = messageStates.get(itemId) ?? {
          outputIndex: Number(value.output_index ?? 0),
          phase: null,
          emittedText: false,
        };
        state.emittedText = true;
        // DeepSeek's `added.phase` is provisional when tools are available: a
        // tool preamble is initially labelled final_answer and corrected on
        // output_item.done. Stream immediately in a neutral pending state.
        const phase =
          input.tools?.length || input.allowClarification ? 'pending' : (state.phase ?? 'pending');
        yield {
          type: 'text.delta',
          delta,
          blockSequence: state.outputIndex,
          phase,
        };
        messageStates.set(itemId, state);
        continue;
      }
      if (value.type === 'response.function_call_arguments.delta') {
        const index = Number(value.output_index ?? 0);
        const call = calls.get(index);
        if (call) call.arguments += String(value.delta ?? '');
        continue;
      }
      if (value.type === 'response.completed' || value.type === 'response.incomplete') {
        const response = value.response as Record<string, any> | undefined;
        incompleteReason =
          value.type === 'response.incomplete'
            ? String(response?.incomplete_details?.reason ?? 'unknown')
            : undefined;
        finishReason =
          value.type === 'response.incomplete'
            ? incompleteReason === 'max_output_tokens'
              ? 'max_output_tokens'
              : 'unknown'
            : 'stop';
        const usage = response?.usage as Record<string, any> | undefined;
        promptTokens = usage?.input_tokens ?? null;
        completionTokens = usage?.output_tokens ?? null;
        cachedTokens = usage?.input_tokens_details?.cached_tokens ?? null;
      }
      if (value.type === 'response.failed')
        throw new ModelProviderResponseError(
          String(value.response?.error?.message ?? 'RESPONSES_API_FAILED'),
        );
    }
    const allCalls = [...calls.values()].filter((call) => call.id && call.name);
    const clarificationCalls = allCalls.filter((call) => call.name === CLARIFICATION_CONTROL_NAME);
    const businessCalls = allCalls.filter((call) => call.name !== CLARIFICATION_CONTROL_NAME);
    if (clarificationCalls.length > 1 || (clarificationCalls.length && businessCalls.length))
      throw new Error('INVALID_CLARIFICATION_PROTOCOL');
    if (clarificationCalls[0])
      yield {
        type: 'clarification.completed',
        request: clarificationRequestSchema.parse(JSON.parse(clarificationCalls[0].arguments)),
      };
    if (businessCalls.length) yield { type: 'tool_calls.completed', calls: businessCalls };
    yield {
      type: 'round.completed',
      finishReason,
      ...(incompleteReason ? { incompleteReason } : {}),
      usage: {
        promptTokens,
        completionTokens,
        cachedTokens,
        estimatedPromptTokens: await this.estimateResponsePromptTokens(responseInput),
      },
    };
  }

  // 执行一次非流式文本生成，供标题和摘要等轻量任务复用。
  async generateText(
    model: string,
    messages: ModelMessage[],
    signal?: AbortSignal,
  ): Promise<string> {
    const configured = getConfiguredModel(model);
    if (configured?.api === 'responses') {
      const response = await this.getClient(model).responses.create(
        {
          model,
          input: (await this.toResponseInput(messages, model)) as never,
          max_output_tokens: configured.request.maxTokens,
          ...(configured.request.temperature !== undefined
            ? { temperature: configured.request.temperature }
            : {}),
        },
        signal ? { signal } : undefined,
      );
      return response.output_text;
    }
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

  private async toResponseInput(
    messages: ModelMessage[],
    model: string,
  ): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    for (const message of messages) {
      if (message.role === 'tool') {
        items.push({
          type: 'function_call_output',
          call_id: message.toolCallId,
          output: message.content,
        });
        continue;
      }
      if (message.role === 'assistant') {
        if (message.reasoning && message.toolCalls?.length)
          items.push({
            type: 'reasoning',
            content: [{ type: 'reasoning_text', text: message.reasoning }],
          });
        if (message.content)
          items.push({
            type: 'message',
            role: 'assistant',
            content: message.content,
            ...(message.phase ? { phase: message.phase } : {}),
          });
        for (const call of message.toolCalls ?? [])
          items.push({
            type: 'function_call',
            call_id: call.id,
            name: call.name,
            arguments: call.arguments,
          });
        continue;
      }
      if (typeof message.content === 'string') {
        items.push({ type: 'message', role: message.role, content: message.content });
        continue;
      }
      if (
        message.content.some((block) => block.type === 'image_ref') &&
        !getConfiguredModel(model)?.supportsVision
      )
        throw new Error('MODEL_VISION_UNSUPPORTED');
      const content = await Promise.all(
        message.content.map(async (block): Promise<Record<string, unknown>> => {
          if (block.type === 'text') return { type: 'input_text', text: block.text };
          if (block.type === 'file_ref')
            return {
              type: 'input_text',
              text: `[Attached file metadata: ${block.fileName}, fileId=${block.fileId}, mediaType=${block.mediaType}, size=${block.size} bytes${block.lineCount !== undefined ? `, lines=${block.lineCount}` : ''}${block.pageCount !== undefined ? `, pages=${block.pageCount}` : ''}. Use search_file or read_file_lines to inspect content.]`,
            };
          if (!this.files) throw new Error('FILE_STORAGE_UNAVAILABLE');
          return {
            type: 'input_image',
            image_url: await this.files.readUrlById(block.fileId),
            detail: block.detail ?? 'auto',
          };
        }),
      );
      items.push({ type: 'message', role: 'user', content });
    }
    return items;
  }

  private toResponseTools(tools: ModelRoundInput['tools']): Record<string, unknown>[] | undefined {
    return tools?.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  private toResponseClarificationTool(): Record<string, unknown> {
    return {
      type: 'function',
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
    };
  }

  private async estimateResponsePromptTokens(input: Record<string, unknown>[]): Promise<number> {
    return this.tokenEstimator.countText(JSON.stringify(input));
  }

  private logResponseEvent(event: Record<string, any>): void {
    const item = event.item as Record<string, any> | undefined;
    const fields = [
      `类型=${String(event.type ?? 'unknown')}`,
      event.output_index !== undefined ? `输出序号=${String(event.output_index)}` : '',
      item?.type ? `Item=${String(item.type)}` : '',
      item?.id ? `ItemId=${String(item.id)}` : '',
      item && 'phase' in item ? `Phase=${String(item.phase)}` : '',
      event.item_id ? `ItemId=${String(event.item_id)}` : '',
      event.delta !== undefined ? `Delta长度=${String(String(event.delta).length)}` : '',
      `字段=${Object.keys(event).sort().join(',')}`,
    ].filter(Boolean);
    this.logger?.debug(`DeepSeek Responses SSE | ${fields.join(' | ')}`);
  }

  // 将 canonical 消息转换为 OpenAI Chat Completions 消息。
  private async toProviderMessages(
    messages: ModelMessage[],
    model: string,
  ): Promise<ChatCompletionMessageParam[]> {
    // 并行解析消息中的图片引用，同时保持原消息顺序。
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
        if (
          message.content.some((block) => block.type === 'image_ref') &&
          !getConfiguredModel(model)?.supportsVision
        )
          throw new Error('MODEL_VISION_UNSUPPORTED');
        const content = await Promise.all(
          message.content.map(async (block) => {
            if (block.type === 'text') return { type: 'text' as const, text: block.text };
            // 文件引用只传递元数据；正文必须通过文件工具按需读取。
            if (block.type === 'file_ref')
              return {
                type: 'text' as const,
                text: `[Attached file metadata: ${block.fileName}, fileId=${block.fileId}, mediaType=${block.mediaType}, size=${block.size} bytes${block.lineCount !== undefined ? `, lines=${block.lineCount}` : ''}${block.pageCount !== undefined ? `, pages=${block.pageCount}` : ''}. Use search_file or read_file_lines to inspect content.]`,
              };
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
    // 将内部工具声明转换为 OpenAI Function Calling 格式。
    return tools?.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  private async estimatePromptTokens(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
  ): Promise<number> {
    // 使用与 Context Engineering 一致的 tokenizer 估算供应商请求大小。
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
    // 按模型配置懒加载并复用 OpenAI-compatible 客户端。
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
