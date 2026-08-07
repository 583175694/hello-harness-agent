import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import type {
  ChatMessage,
  ChatStreamEvent,
  SearchSourceSnapshot,
  SearchToolResult,
} from '@harness/agent-protocol';
import { ENV_KEYS } from '../bootstrap/env.constants';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { PrismaService } from '../database/prisma.service';
import { AgentRuntimeService } from '../agent-runtime/agent-runtime.service';
import { SessionExecutionRegistry } from '../sessions/session-execution.registry';
import { SearchProjectionCollector } from '../projection/search-projection.collector';
import { AssistantDeliveryRepository } from '../persistence/assistant-delivery.repository';
import { describeLogError, formatLogDuration, shortLogId } from '../shared/logging.utils';
import { CHAT_CONTEXT_MESSAGE_LIMIT, CHAT_SYSTEM_PROMPT } from './chat.constants';

type PreparedSessionStream = {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  messages: ChatMessage[];
};

@Injectable()
export class ChatService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionExecutionRegistry) private readonly executions: SessionExecutionRegistry,
    @Inject(AgentRuntimeService) private readonly runtime: AgentRuntimeService,
    @Inject(AssistantDeliveryRepository) private readonly delivery: AssistantDeliveryRepository,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  // 在发送 SSE 头之前校验、加锁、持久化用户消息并读取数据库上下文。
  async prepareSessionStream(sessionId: string, content: string): Promise<PreparedSessionStream> {
    const startedAt = Date.now();
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: LOCAL_USER_ID },
    });
    if (!session)
      throw new NotFoundException({
        code: AGENT_ERROR_CODES.sessionNotFound,
        detail: '会话不存在。',
      });
    // 从持久化开始占用执行权，保证同一会话的上下文不会被并发写入打乱。
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
        take: CHAT_CONTEXT_MESSAGE_LIMIT,
      });
      const assistantMessageId = crypto.randomUUID();
      this.logger.log(
        `会话准备完成 | 会话=${shortLogId(sessionId)} | 用户消息=${shortLogId(userMessageId)} | 回复消息=${shortLogId(assistantMessageId)} | 上下文=${stored.length} 条 | 耗时=${formatLogDuration(Date.now() - startedAt)}`,
        ChatService.name,
      );
      return {
        sessionId,
        userMessageId,
        assistantMessageId,
        // 数据库按倒序截取最近消息，交给模型前恢复为自然时间顺序。
        messages: stored.reverse().map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        })),
      };
    } catch (error) {
      this.executions.release(sessionId);
      throw error;
    }
  }

  // 调用 Agent Runtime，并将当前搜索事件投影为兼容现有客户端的 Chat SSE。
  async *streamPrepared(
    prepared: PreparedSessionStream,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const model = this.config.getOrThrow<string>(ENV_KEYS.openAiModel);
    const startedAt = Date.now();
    this.requireApiKey();
    this.logger.log(
      `开始生成回复 | 会话=${shortLogId(prepared.sessionId)} | 模型=${model} | 上下文=${prepared.messages.length} 条`,
      ChatService.name,
    );
    const projection = new SearchProjectionCollector();
    let content = '';
    let toolCallCount = 0;
    let firstDeltaAt: number | undefined;

    for await (const event of this.runtime.run({
      sessionId: prepared.sessionId,
      messageId: prepared.assistantMessageId,
      model,
      systemPrompt: CHAT_SYSTEM_PROMPT,
      messages: prepared.messages,
      signal,
    })) {
      if (event.type === 'text.delta') {
        // 只记录首个文本增量；逐片打印 SSE delta 会淹没真正有用的链路日志。
        if (firstDeltaAt === undefined) {
          firstDeltaAt = Date.now();
          this.logger.log(
            `模型开始响应 | 会话=${shortLogId(prepared.sessionId)} | 首字耗时=${formatLogDuration(firstDeltaAt - startedAt)}`,
            ChatService.name,
          );
        }
        yield { type: 'message.delta', messageId: prepared.assistantMessageId, delta: event.delta };
        continue;
      }
      if (event.type === 'tool.started') {
        yield {
          type: 'tool.started',
          messageId: prepared.assistantMessageId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: this.asSearchInput(event.input),
          startedAt: event.startedAt,
        };
        continue;
      }
      if (event.type === 'tool.completed') {
        const result = event.output as SearchToolResult;
        const input = this.asSearchInput(event.input);
        projection.recordCompleted({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          query: input.query,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          result,
        });
        yield {
          type: 'tool.completed',
          messageId: prepared.assistantMessageId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          result,
        };
        continue;
      }
      if (event.type === 'tool.failed') {
        const input = this.asSearchInput(event.input);
        projection.recordFailed({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          query: input.query,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          code: event.code,
          detail: event.detail,
        });
        yield {
          type: 'tool.failed',
          messageId: prepared.assistantMessageId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          code: event.code,
          detail: event.detail,
        };
        continue;
      }
      // 除文本和工具事件外只剩 run.completed，它提供最终持久化所需的汇总状态。
      content = event.content;
      toolCallCount = event.toolCallCount;
    }

    if (!content.trim())
      throw new ServiceUnavailableException({
        code: AGENT_ERROR_CODES.modelEmptyResponse,
        detail: '模型没有返回可显示的文本，请稍后重试。',
      });
    const snapshot = projection.snapshot();
    const linkedContent = this.ensureSourceLinks(content, snapshot.sources);
    // 当前搜索协议要求结果至少带可访问链接；模型未主动输出时补充去重后的来源列表。
    if (linkedContent.length > content.length) {
      yield {
        type: 'message.delta',
        messageId: prepared.assistantMessageId,
        delta: linkedContent.slice(content.length),
      };
      content = linkedContent;
    }
    await this.delivery.save({
      sessionId: prepared.sessionId,
      messageId: prepared.assistantMessageId,
      model,
      content,
      toolCallCount,
      executions: snapshot.executions,
      sources: snapshot.sources,
    });
    this.logger.log(
      `回复完成 | 会话=${shortLogId(prepared.sessionId)} | 总耗时=${formatLogDuration(Date.now() - startedAt)} | 输出=${content.length} 字 | 工具=${toolCallCount} 次`,
      ChatService.name,
    );
    yield { type: 'message.completed', messageId: prepared.assistantMessageId, model };
  }

  // 释放由 Controller 持有到 SSE 完成的会话执行权。
  releaseSession(sessionId: string): void {
    this.executions.release(sessionId);
  }

  // 统一记录流式回复失败，避免不同层重复输出同一异常。
  logStreamFailure(sessionId: string, elapsedMilliseconds: number, error: unknown): void {
    this.logger.warn(
      `回复生成失败 | 会话=${shortLogId(sessionId)} | 耗时=${formatLogDuration(elapsedMilliseconds)} | 原因=${describeLogError(error)}`,
      ChatService.name,
    );
  }

  // 读取模型密钥，缺失时返回可操作的配置错误。
  private requireApiKey(): string {
    const key = this.config.get<string>(ENV_KEYS.openAiApiKey);
    if (!key)
      throw new ServiceUnavailableException({
        code: AGENT_ERROR_CODES.modelNotConfigured,
        detail: `请在 .env 中配置 ${ENV_KEYS.openAiApiKey} 后再发送消息。`,
      });
    return key;
  }

  // 当前协议仍是搜索专用，集中保留转换点，后续由 Projection 层替代。
  private asSearchInput(input: unknown): { query: string } {
    if (
      typeof input === 'object' &&
      input !== null &&
      'query' in input &&
      typeof input.query === 'string'
    )
      return { query: input.query };
    return { query: '' };
  }

  // 搜索回答缺少真实链接时追加少量可验证来源。
  private ensureSourceLinks(content: string, sources: SearchSourceSnapshot[]): string {
    if (!sources.length || sources.some((source) => content.includes(source.url))) return content;
    const links = sources
      .slice(0, 5)
      .map(
        (source) =>
          `- [${source.title.replaceAll('[', '\\[').replaceAll(']', '\\]')}](${source.url})`,
      );
    return `${content.trimEnd()}\n\n### 检索来源\n\n${links.join('\n')}`;
  }
}
