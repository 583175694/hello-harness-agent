import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import type { ChatMessage, ChatStreamEvent, SearchSourceSnapshot, SearchToolResult } from '@harness/agent-protocol';
import { ENV_KEYS } from '../bootstrap/env.constants';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { PrismaService } from '../database/prisma.service';
import { AgentRuntimeService } from '../agent-runtime/agent-runtime.service';
import { SessionExecutionRegistry } from '../sessions/session-execution.registry';
import { SearchProjectionCollector } from '../projection/search-projection.collector';
import { AssistantDeliveryRepository } from '../persistence/assistant-delivery.repository';
import { CHAT_CONTEXT_MESSAGE_LIMIT, CHAT_SYSTEM_PROMPT } from './chat.constants';

type PreparedSessionStream = {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  messages: ChatMessage[];
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly executions: SessionExecutionRegistry,
    private readonly runtime: AgentRuntimeService,
    private readonly delivery: AssistantDeliveryRepository,
  ) {}

  // 在发送 SSE 头之前校验、加锁、持久化用户消息并读取数据库上下文。
  async prepareSessionStream(sessionId: string, content: string): Promise<PreparedSessionStream> {
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId: LOCAL_USER_ID } });
    if (!session) throw new NotFoundException({ code: AGENT_ERROR_CODES.sessionNotFound, detail: '会话不存在。' });
    this.executions.acquire(sessionId);
    const userMessageId = crypto.randomUUID();
    try {
      await this.prisma.$transaction([
        this.prisma.message.create({
          data: { id: userMessageId, userId: LOCAL_USER_ID, sessionId, role: 'user', kind: 'user_message', content },
        }),
        this.prisma.session.update({ where: { id: sessionId }, data: { updatedAt: new Date() } }),
      ]);
      const stored = await this.prisma.message.findMany({
        where: { sessionId, userId: LOCAL_USER_ID, role: { in: ['user', 'assistant'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: CHAT_CONTEXT_MESSAGE_LIMIT,
      });
      return {
        sessionId,
        userMessageId,
        assistantMessageId: crypto.randomUUID(),
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
  async *streamPrepared(prepared: PreparedSessionStream, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    const model = this.config.getOrThrow<string>(ENV_KEYS.openAiModel);
    const startedAt = Date.now();
    this.requireApiKey();
    this.logger.log(`开始生成回复 | 会话=${this.shortId(prepared.sessionId)} | 模型=${model} | 上下文=${prepared.messages.length} 条`);
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
        if (firstDeltaAt === undefined) {
          firstDeltaAt = Date.now();
          this.logger.log(`模型开始响应 | 会话=${this.shortId(prepared.sessionId)} | 首字耗时=${this.formatDuration(firstDeltaAt - startedAt)}`);
        }
        yield { type: 'message.delta', messageId: prepared.assistantMessageId, delta: event.delta };
        continue;
      }
      if (event.type === 'tool.started') {
        yield {
          type: 'tool.started', messageId: prepared.assistantMessageId, toolCallId: event.toolCallId,
          toolName: event.toolName, input: this.asSearchInput(event.input), startedAt: event.startedAt,
        };
        continue;
      }
      if (event.type === 'tool.completed') {
        const result = event.output as SearchToolResult;
        const input = this.asSearchInput(event.input);
        projection.recordCompleted({
          toolCallId: event.toolCallId, toolName: event.toolName, query: input.query,
          completedAt: event.completedAt, durationMs: event.durationMs, result,
        });
        yield {
          type: 'tool.completed', messageId: prepared.assistantMessageId, toolCallId: event.toolCallId,
          toolName: event.toolName, completedAt: event.completedAt, durationMs: event.durationMs, result,
        };
        this.logger.log(`工具完成 | 会话=${this.shortId(prepared.sessionId)} | 调用=${this.shortId(event.toolCallId)} | 结果=${result.results.length} 条 | 耗时=${this.formatDuration(event.durationMs)}`);
        continue;
      }
      if (event.type === 'tool.failed') {
        const input = this.asSearchInput(event.input);
        projection.recordFailed({
          toolCallId: event.toolCallId, toolName: event.toolName, query: input.query,
          completedAt: event.completedAt, durationMs: event.durationMs, code: event.code, detail: event.detail,
        });
        yield {
          type: 'tool.failed', messageId: prepared.assistantMessageId, toolCallId: event.toolCallId,
          toolName: event.toolName, completedAt: event.completedAt, durationMs: event.durationMs,
          code: event.code, detail: event.detail,
        };
        continue;
      }
      content = event.content;
      toolCallCount = event.toolCallCount;
    }

    if (!content.trim()) throw new ServiceUnavailableException({ code: AGENT_ERROR_CODES.modelEmptyResponse, detail: '模型没有返回可显示的文本，请稍后重试。' });
    const snapshot = projection.snapshot();
    const linkedContent = this.ensureSourceLinks(content, snapshot.sources);
    if (linkedContent.length > content.length) {
      yield { type: 'message.delta', messageId: prepared.assistantMessageId, delta: linkedContent.slice(content.length) };
      content = linkedContent;
    }
    await this.delivery.save({
      sessionId: prepared.sessionId, messageId: prepared.assistantMessageId, model, content,
      toolCallCount, executions: snapshot.executions, sources: snapshot.sources,
    });
    this.logger.log(`回复完成 | 会话=${this.shortId(prepared.sessionId)} | 总耗时=${this.formatDuration(Date.now() - startedAt)} | 输出=${content.length} 字`);
    yield { type: 'message.completed', messageId: prepared.assistantMessageId, model };
  }

  // 释放由 Controller 持有到 SSE 完成的会话执行权。
  releaseSession(sessionId: string): void { this.executions.release(sessionId); }

  // 统一记录流式回复失败，避免不同层重复输出同一异常。
  logStreamFailure(sessionId: string, elapsedMilliseconds: number, error: unknown): void {
    const reason = error instanceof Error ? error.name : '未知错误';
    this.logger.warn(`回复生成失败 | 会话=${this.shortId(sessionId)} | 耗时=${this.formatDuration(elapsedMilliseconds)} | 原因=${reason}`);
  }

  // 读取模型密钥，缺失时返回可操作的配置错误。
  private requireApiKey(): string {
    const key = this.config.get<string>(ENV_KEYS.openAiApiKey);
    if (!key) throw new ServiceUnavailableException({ code: AGENT_ERROR_CODES.modelNotConfigured, detail: `请在 .env 中配置 ${ENV_KEYS.openAiApiKey} 后再发送消息。` });
    return key;
  }

  // 当前协议仍是搜索专用，集中保留转换点，后续由 Projection 层替代。
  private asSearchInput(input: unknown): { query: string } {
    if (typeof input === 'object' && input !== null && 'query' in input && typeof input.query === 'string') return { query: input.query };
    return { query: '' };
  }

  // 缩短内部标识，保留排查关联能力并降低日志噪声。
  private shortId(id: string): string { return id.slice(0, 8); }

  // 将毫秒转换为适合终端阅读的中文耗时。
  private formatDuration(milliseconds: number): string { return milliseconds < 1000 ? `${milliseconds} 毫秒` : `${(milliseconds / 1000).toFixed(2)} 秒`; }

  // 搜索回答缺少真实链接时追加少量可验证来源。
  private ensureSourceLinks(content: string, sources: SearchSourceSnapshot[]): string {
    if (!sources.length || sources.some((source) => content.includes(source.url))) return content;
    const links = sources.slice(0, 5).map((source) => `- [${source.title.replaceAll('[', '\\[').replaceAll(']', '\\]')}](${source.url})`);
    return `${content.trimEnd()}\n\n### 检索来源\n\n${links.join('\n')}`;
  }
}
