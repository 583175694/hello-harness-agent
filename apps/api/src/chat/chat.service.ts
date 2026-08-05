import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import type { ChatMessage, ChatResponse, ChatStreamEvent } from '@harness/agent-protocol';

const systemPrompt =
  '你是一个可靠、简洁的通用任务助手。当前阶段只进行普通对话，不调用工具；如果用户要求检索或执行操作，请明确说明后续会由工具流程处理。';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private client?: OpenAI;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  // 执行当前不调用工具的普通对话请求。
  async complete(messages: ChatMessage[]): Promise<ChatResponse> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'MODEL_NOT_CONFIGURED',
        detail: '请在 .env 中配置 OPENAI_API_KEY 后再发送消息。',
      });
    }

    const client = this.getClient(apiKey);
    const model = this.config.getOrThrow<string>('OPENAI_MODEL');
    const startedAt = Date.now();
    this.logger.log(`[chat.complete] start model=${model} messages=${messages.length}`);
    let response;
    try {
      response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.toProviderMessages(messages.slice(-20)),
        ],
      });
    } catch (error) {
      this.logger.warn(
        `[chat.complete] provider failed after ${Date.now() - startedAt}ms error=${this.errorName(error)}`,
      );
      throw new BadGatewayException({
        code: 'MODEL_REQUEST_FAILED',
        detail: '模型服务暂时不可用，请检查供应商配置后重试。',
      });
    }
    const content = response.choices[0]?.message.content?.trim();
    if (!content) {
      this.logger.warn(`[chat.complete] empty response after ${Date.now() - startedAt}ms`);
      throw new ServiceUnavailableException({
        code: 'MODEL_EMPTY_RESPONSE',
        detail: '模型没有返回可显示的文本，请稍后重试。',
      });
    }

    this.logger.log(`[chat.complete] completed after ${Date.now() - startedAt}ms`);
    return {
      message: { id: crypto.randomUUID(), role: 'assistant', content },
      model: response.model || model,
    };
  }

  // 将供应商的流式分片转换为稳定的协议事件。
  async *stream(
    messages: ChatMessage[],
  ): AsyncGenerator<ChatStreamEvent> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'MODEL_NOT_CONFIGURED',
        detail: '请在 .env 中配置 OPENAI_API_KEY 后再发送消息。',
      });
    }

    const client = this.getClient(apiKey);
    const model = this.config.getOrThrow<string>('OPENAI_MODEL');
    const startedAt = Date.now();
    this.logger.log(`[chat.stream] start model=${model} messages=${messages.length}`);
    let response;
    try {
      response = await client.chat.completions.create({
        model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.toProviderMessages(messages.slice(-20)),
        ],
      });
    } catch (error) {
      this.logger.warn(
        `[chat.stream] provider failed before first chunk after ${Date.now() - startedAt}ms error=${this.errorName(error)}`,
      );
      throw new BadGatewayException({
        code: 'MODEL_REQUEST_FAILED',
        detail: '模型服务暂时不可用，请检查供应商配置后重试。',
      });
    }

    const messageId = crypto.randomUUID();
    let firstDeltaAt: number | undefined;
    let deltaCount = 0;
    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta.content;
      if (delta) {
        deltaCount += 1;
        if (firstDeltaAt === undefined) {
          firstDeltaAt = Date.now();
          this.logger.log(`[chat.stream] first delta after ${firstDeltaAt - startedAt}ms`);
        }
        yield { type: 'message.delta', messageId, delta };
      }
    }
    this.logger.log(
      `[chat.stream] completed after ${Date.now() - startedAt}ms deltas=${deltaCount}`,
    );
    yield { type: 'message.completed', messageId, model };
  }

  // 返回异常类型，避免日志泄露供应商响应内容。
  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : 'UnknownError';
  }

  // 将共享协议消息转换为 OpenAI-compatible 消息。
  private toProviderMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
    const providerMessages: ChatCompletionMessageParam[] = [];
    for (const message of messages) {
      if (message.role === 'tool') {
        providerMessages.push({ role: 'tool', content: message.content, tool_call_id: message.toolCallId });
        continue;
      }
      if (message.role === 'assistant') {
        providerMessages.push({
          role: 'assistant' as const,
          content: message.content ?? null,
          tool_calls: message.toolCalls?.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
          })),
        });
        continue;
      }
      if (message.role === 'system') providerMessages.push({ role: 'system', content: message.content });
      else providerMessages.push({ role: 'user', content: message.content });
    }
    return providerMessages;
  }

  // 延迟创建模型客户端，保证没有 Key 时 API 仍可启动。
  private getClient(apiKey: string): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey,
        baseURL: this.config.get<string>('OPENAI_BASE_URL') || undefined,
      });
    }
    return this.client;
  }
}
