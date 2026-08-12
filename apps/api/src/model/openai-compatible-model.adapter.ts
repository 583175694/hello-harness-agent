import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

import { ENV_KEYS } from '../bootstrap/env.constants';
import { ModelAdapter } from './model-adapter';
import type {
  ModelMessage,
  ModelRoundEvent,
  ModelRoundInput,
  ModelToolCall,
} from './model-adapter';

@Injectable()
export class OpenAICompatibleModelAdapter extends ModelAdapter {
  private client?: OpenAI;

  constructor(private readonly config: ConfigService) {
    super();
  }

  // 调用 OpenAI-compatible 流接口，并把供应商 chunk 归一化为一个 Model Round。
  // Chat Completions 没有 Content/Tool Call 共用的全局 index，因此按 Block 首次出现顺序
  // 分配 blockSequence；Tool Call 自身仍按 provider index 聚合和恢复声明顺序。
  async *streamRound(input: ModelRoundInput): AsyncIterable<ModelRoundEvent> {
    const response = await this.getClient().chat.completions.create(
      {
        model: input.model,
        stream: true,
        messages: this.toProviderMessages(input.messages),
        ...(input.tools
          ? { tools: this.toProviderTools(input.tools), tool_choice: 'auto' as const }
          : {}),
      },
      input.signal ? { signal: input.signal } : undefined,
    );
    const pendingCalls = new Map<number, ModelToolCall>();
    let finishReason: string | null = null;
    let nextBlockSequence = 0;
    let contentBlockSequence: number | undefined;

    // 一个工具调用的名称和 JSON 参数可能跨多个 chunk，必须按 index 分组累积。
    for await (const chunk of response) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      finishReason = choice.finish_reason ?? finishReason;
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
    yield { type: 'round.completed', finishReason };
  }

  // 执行一次非流式文本生成，供标题等轻量任务复用。
  async generateText(model: string, messages: ModelMessage[]): Promise<string> {
    const response = await this.getClient().chat.completions.create({
      model,
      messages: this.toProviderMessages(messages),
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
          tool_calls: message.toolCalls?.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: call.arguments },
          })),
        };
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

  // 延迟创建客户端，保证未配置模型时 API 仍可启动并返回明确错误。
  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.getOrThrow<string>(ENV_KEYS.openAiApiKey),
        baseURL: this.config.get<string>(ENV_KEYS.openAiBaseUrl) || undefined,
      });
    }
    return this.client;
  }
}
