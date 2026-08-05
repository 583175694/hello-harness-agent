import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import type { ChatMessage, ChatStreamEvent } from '@harness/agent-protocol';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { PrismaService } from '../database/prisma.service';
import { SessionExecutionRegistry } from '../sessions/session-execution.registry';

const systemPrompt =
  '你是一个可靠、简洁的通用任务助手。当前阶段只进行普通对话，不调用工具；如果用户要求检索或执行操作，请明确说明后续会由工具流程处理。';

type PreparedSessionStream = {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  messages: ChatMessage[];
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private client?: OpenAI;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionExecutionRegistry) private readonly executions: SessionExecutionRegistry,
  ) {}

  // 在发送 SSE 头之前校验、加锁、持久化用户消息并读取数据库上下文。
  async prepareSessionStream(sessionId: string, content: string): Promise<PreparedSessionStream> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: LOCAL_USER_ID },
    });
    if (!session) {
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', detail: '会话不存在。' });
    }
    this.executions.acquire(sessionId);
    const userMessageId = crypto.randomUUID();
    try {
      await this.prisma.$transaction([
        this.prisma.message.create({
          data: {
            id: userMessageId,
            userId: LOCAL_USER_ID,
            sessionId,
            role: 'user',
            kind: 'user_message',
            content,
          },
        }),
        this.prisma.session.update({ where: { id: sessionId }, data: { updatedAt: new Date() } }),
      ]);
      const stored = await this.prisma.message.findMany({
        where: { sessionId, userId: LOCAL_USER_ID, role: { in: ['user', 'assistant'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      });
      const messages: ChatMessage[] = stored.reverse().map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      }));
      return { sessionId, userMessageId, assistantMessageId: crypto.randomUUID(), messages };
    } catch (error) {
      this.executions.release(sessionId);
      throw error;
    }
  }

  // 流式调用模型，并仅在完整结束后持久化 assistant 消息。
  async *streamPrepared(prepared: PreparedSessionStream): AsyncGenerator<ChatStreamEvent> {
    const apiKey = this.requireApiKey();
    const client = this.getClient(apiKey);
    const model = this.config.getOrThrow<string>('OPENAI_MODEL');
    const startedAt = Date.now();
    this.logger.log(
      `开始生成回复 | 会话=${this.shortId(prepared.sessionId)} | 模型=${model} | 上下文=${prepared.messages.length} 条`,
    );
    let response;
    try {
      response = await client.chat.completions.create({
        model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.toProviderMessages(prepared.messages),
        ],
      });
    } catch {
      throw new BadGatewayException({
        code: 'MODEL_REQUEST_FAILED',
        detail: '模型服务暂时不可用，请检查供应商配置后重试。',
      });
    }

    let content = '';
    let firstDeltaAt: number | undefined;
    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta.content;
      if (!delta) continue;
      content += delta;
      if (firstDeltaAt === undefined) {
        firstDeltaAt = Date.now();
        this.logger.log(
          `模型开始响应 | 会话=${this.shortId(prepared.sessionId)} | 首字耗时=${this.formatDuration(firstDeltaAt - startedAt)}`,
        );
      }
      yield { type: 'message.delta', messageId: prepared.assistantMessageId, delta };
    }
    if (!content.trim()) {
      throw new ServiceUnavailableException({
        code: 'MODEL_EMPTY_RESPONSE',
        detail: '模型没有返回可显示的文本，请稍后重试。',
      });
    }
    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          id: prepared.assistantMessageId,
          userId: LOCAL_USER_ID,
          sessionId: prepared.sessionId,
          role: 'assistant',
          kind: 'assistant_delivery',
          content,
          metadata: { model },
        },
      }),
      this.prisma.session.update({
        where: { id: prepared.sessionId },
        data: { updatedAt: new Date() },
      }),
    ]);
    this.logger.log(
      `回复完成 | 会话=${this.shortId(prepared.sessionId)} | 总耗时=${this.formatDuration(Date.now() - startedAt)} | 输出=${content.length} 字`,
    );
    yield { type: 'message.completed', messageId: prepared.assistantMessageId, model };
  }

  // 释放由 controller 持有到 SSE 完成的会话执行权。
  releaseSession(sessionId: string): void {
    this.executions.release(sessionId);
  }

  // 统一记录流式回复失败，避免不同层重复输出同一异常。
  logStreamFailure(sessionId: string, elapsedMilliseconds: number, error: unknown): void {
    const reason = error instanceof Error ? error.name : '未知错误';
    this.logger.warn(
      `回复生成失败 | 会话=${this.shortId(sessionId)} | 耗时=${this.formatDuration(elapsedMilliseconds)} | 原因=${reason}`,
    );
  }

  // 使用主模型将首轮问答压缩为单行短标题。
  async generateTitle(userContent: string, assistantContent: string): Promise<string> {
    const apiKey = this.requireApiKey();
    const model = this.config.getOrThrow<string>('OPENAI_MODEL');
    const response = await this.getClient(apiKey).chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: '根据首轮对话生成简体中文会话标题。只输出标题，不加引号或标点，最多 28 个字符。',
        },
        { role: 'user', content: `用户：${userContent}\n助手：${assistantContent}` },
      ],
    });
    const title = response.choices[0]?.message.content
      ?.replace(/[\r\n]+/g, ' ')
      .replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 28);
    if (!title) throw new Error('EmptyGeneratedTitle');
    return title;
  }

  // 读取模型密钥，缺失时返回可操作的配置错误。
  private requireApiKey(): string {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'MODEL_NOT_CONFIGURED',
        detail: '请在 .env 中配置 OPENAI_API_KEY 后再发送消息。',
      });
    }
    return apiKey;
  }

  // 缩短内部标识，保留排查关联能力并降低日志噪声。
  private shortId(id: string): string {
    return id.slice(0, 8);
  }

  // 将毫秒转换为适合终端阅读的中文耗时。
  private formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) return `${milliseconds} 毫秒`;
    return `${(milliseconds / 1000).toFixed(2)} 秒`;
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
