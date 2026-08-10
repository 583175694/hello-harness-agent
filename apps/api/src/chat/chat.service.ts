import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

import { AGENT_ERROR_CODES, AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import type {
  ChatMessage,
  ChatStreamEvent,
  ResearchSourceSnapshot,
  SearchToolResult,
  WebFetchInput,
  WebFetchResult,
} from '@harness/agent-protocol';
import { ENV_KEYS } from '../bootstrap/env.constants';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { PrismaService } from '../database/prisma.service';
import { AgentRuntimeService } from '../agent-runtime/agent-runtime.service';
import { SessionExecutionRegistry } from '../sessions/session-execution.registry';
import { ResearchProjectionCollector } from '../projection/research-projection.collector';
import { ConversationBlockCollector } from '../projection/conversation-block.collector';
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
    const projection = new ResearchProjectionCollector();
    const conversation = new ConversationBlockCollector(prepared.assistantMessageId);
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
        const blockId = conversation.appendText(event.delta);
        yield {
          type: 'message.delta',
          messageId: prepared.assistantMessageId,
          blockId,
          delta: event.delta,
        };
        continue;
      }
      if (event.type === 'tool.started') {
        const isFetch = event.toolName === AGENT_TOOL_NAMES.webFetch;
        const fetchInput = isFetch ? this.asWebFetchInput(event.input) : undefined;
        const searchInput = isFetch ? undefined : this.asSearchInput(event.input);
        const block = conversation.startTool({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          summary: fetchInput
            ? `读取 ${fetchInput.urls.length} 个网页`
            : searchInput?.query ?? '',
          startedAt: event.startedAt,
        });
        if (fetchInput) {
          yield {
            type: 'tool.started',
            messageId: prepared.assistantMessageId,
            blockId: block.id,
            toolCallId: event.toolCallId,
            toolName: AGENT_TOOL_NAMES.webFetch,
            title: block.title,
            input: fetchInput,
            startedAt: event.startedAt,
          };
        } else {
          yield {
            type: 'tool.started',
            messageId: prepared.assistantMessageId,
            blockId: block.id,
            toolCallId: event.toolCallId,
            toolName: AGENT_TOOL_NAMES.webSearch,
            title: block.title,
            input: searchInput ?? { query: '' },
            startedAt: event.startedAt,
          };
        }
        continue;
      }
      if (event.type === 'tool.completed') {
        const isFetch = event.toolName === AGENT_TOOL_NAMES.webFetch;
        const fetchResult = isFetch ? event.output as WebFetchResult : undefined;
        const searchResult = isFetch ? undefined : event.output as SearchToolResult;
        const fetchInput = isFetch ? this.asWebFetchInput(event.input) : undefined;
        const searchInput = isFetch ? undefined : this.asSearchInput(event.input);
        if (fetchResult && fetchInput) {
          projection.recordFetchCompleted({
            toolCallId: event.toolCallId,
            toolInput: fetchInput,
            completedAt: event.completedAt,
            durationMs: event.durationMs,
            result: fetchResult,
          });
        } else if (searchResult) {
          projection.recordSearchCompleted({
            toolCallId: event.toolCallId,
            query: searchInput?.query ?? '',
            completedAt: event.completedAt,
            durationMs: event.durationMs,
            result: searchResult,
          });
        }
        const fetchSucceeded = fetchResult?.results.filter((item) => item.status === 'succeeded') ?? [];
        const fetchFailed = fetchResult?.results.filter((item) => item.status === 'failed') ?? [];
        const fetchSkipped = fetchResult?.results.filter((item) => item.status === 'skipped') ?? [];
        const passageCount = fetchSucceeded.reduce((total, item) => total + item.passages.length, 0);
        const blockId = conversation.completeTool({
          toolCallId: event.toolCallId,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          summary: fetchResult
            ? `成功 ${fetchSucceeded.length} 个，失败 ${fetchFailed.length} 个，跳过 ${fetchSkipped.length} 个，提取 ${passageCount} 段原文 · URL ${fetchResult.budget.urls.used}/${fetchResult.budget.urls.limit}`
            : `找到 ${searchResult?.results.length ?? 0} 个结果`,
        });
        if (fetchResult) {
          yield {
            type: 'tool.completed',
            messageId: prepared.assistantMessageId,
            blockId,
            toolCallId: event.toolCallId,
            toolName: AGENT_TOOL_NAMES.webFetch,
            completedAt: event.completedAt,
            durationMs: event.durationMs,
            result: fetchResult,
          };
        } else if (searchResult) {
          yield {
            type: 'tool.completed',
            messageId: prepared.assistantMessageId,
            blockId,
            toolCallId: event.toolCallId,
            toolName: AGENT_TOOL_NAMES.webSearch,
            completedAt: event.completedAt,
            durationMs: event.durationMs,
            result: searchResult,
          };
        }
        continue;
      }
      if (event.type === 'tool.failed') {
        const toolInput = this.asProjectionInput(event.toolName, event.input);
        if (toolInput) projection.recordFailed({
          toolCallId: event.toolCallId,
          ...toolInput,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          code: event.code,
          detail: event.detail,
        });
        const blockId = conversation.failTool({
          toolCallId: event.toolCallId,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          detail: event.detail,
        });
        yield {
          type: 'tool.failed',
          messageId: prepared.assistantMessageId,
          blockId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          code: event.code,
          detail: event.detail,
        };
        continue;
      }
      if (event.type === 'tool.cancelled') {
        const toolInput = this.asProjectionInput(event.toolName, event.input);
        if (toolInput) projection.recordCancelled({
          toolCallId: event.toolCallId,
          ...toolInput,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          code: event.code,
          detail: event.detail,
        });
        const blockId = conversation.cancelTool({
          toolCallId: event.toolCallId,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          detail: event.detail,
        });
        yield {
          type: 'tool.cancelled',
          messageId: prepared.assistantMessageId,
          blockId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
          code: event.code,
          detail: event.detail,
        };
        continue;
      }
      // 除文本和工具生命周期事件外只剩 run.completed，它提供最终持久化所需的汇总状态。
      content = event.content;
      toolCallCount = event.toolCallCount;
    }

    if (!content.trim())
      throw new ServiceUnavailableException({
        code: AGENT_ERROR_CODES.modelEmptyResponse,
        detail: '模型没有返回可显示的文本，请稍后重试。',
      });
    let snapshot = projection.snapshot();
    const linkedContent = this.ensureSourceLinks(content, snapshot.sources);
    // 当前搜索协议要求结果至少带可访问链接；模型未主动输出时补充去重后的来源列表。
    if (linkedContent.length > content.length) {
      const delta = linkedContent.slice(content.length);
      const blockId = conversation.appendText(delta);
      yield {
        type: 'message.delta',
        messageId: prepared.assistantMessageId,
        blockId,
        delta,
      };
      content = linkedContent;
    }
    projection.markUsed(content);
    snapshot = projection.snapshot();
    await this.delivery.save({
      sessionId: prepared.sessionId,
      messageId: prepared.assistantMessageId,
      model,
      blocks: conversation.snapshot(),
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

  // 从 Runtime 未知输入中读取网页搜索参数。
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

  // 从 Runtime 未知输入中读取批量网页 Fetch 参数。
  private asWebFetchInput(input: unknown): WebFetchInput {
    if (
      typeof input === 'object' &&
      input !== null &&
      'urls' in input &&
      Array.isArray(input.urls) &&
      input.urls.every((url) => typeof url === 'string')
    ) {
      const query = 'query' in input && typeof input.query === 'string' ? input.query : undefined;
      return { urls: input.urls, ...(query ? { query } : {}) };
    }
    return { urls: [] };
  }

  // 将 Runtime 工具名和输入收敛为研究投影支持的判别联合。
  private asProjectionInput(toolName: string, input: unknown) {
    if (toolName === AGENT_TOOL_NAMES.webFetch) {
      return { toolName: AGENT_TOOL_NAMES.webFetch, input: this.asWebFetchInput(input) } as const;
    }
    if (toolName === AGENT_TOOL_NAMES.webSearch) {
      return { toolName: AGENT_TOOL_NAMES.webSearch, input: this.asSearchInput(input) } as const;
    }
    return undefined;
  }

  // 搜索回答缺少真实链接时追加少量可验证来源。
  private ensureSourceLinks(content: string, sources: ResearchSourceSnapshot[]): string {
    const preferred = sources.some((source) => source.kind === 'fetched')
      ? sources.filter((source) => source.kind === 'fetched')
      : sources;
    const sourceUrl = (source: ResearchSourceSnapshot): string =>
      source.kind === 'fetched' ? source.finalUrl : source.url;
    if (!preferred.length || preferred.some((source) => content.includes(sourceUrl(source)))) return content;
    const links = preferred
      .slice(0, 5)
      .map(
        (source) =>
          `- [${source.title.replaceAll('[', '\\[').replaceAll(']', '\\]')}](${sourceUrl(source)})`,
      );
    const heading = preferred.some((source) => source.kind === 'fetched')
      ? '### 搜索来源'
      : '### 搜索线索';
    return `${content.trimEnd()}\n\n${heading}\n\n${links.join('\n')}`;
  }
}
