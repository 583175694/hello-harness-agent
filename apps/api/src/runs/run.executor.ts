import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatMessage, ChatStreamEvent, RunSnapshot } from '@harness/agent-protocol';
import { ENV_KEYS } from '../bootstrap/env.constants';
import { PrismaService } from '../database/prisma.service';
import { ChatService, type ChatProjectionSnapshot } from '../chat/chat.service';
import { CHAT_CONTEXT_MESSAGE_LIMIT } from '../chat/chat.constants';
import { compareMessageOrder } from '../chat/message-order';
import { SessionTitleService } from '../sessions/session-title.service';
import { ActiveRunRegistry } from './active-run.registry';
import { RunEventHub } from './run-event-hub';
import { RunRepository } from './run.repository';

@Injectable()
export class RunExecutor implements OnModuleDestroy {
  // execution Promise 独立于 SSE 连接；没有浏览器观察者时后台 Run 仍继续执行。
  private readonly executions = new Map<string, Promise<void>>();
  private shuttingDown = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ActiveRunRegistry) private readonly registry: ActiveRunRegistry,
    @Inject(RunEventHub) private readonly events: RunEventHub,
    @Inject(RunRepository) private readonly repository: RunRepository,
    @Inject(SessionTitleService) private readonly titles: SessionTitleService,
  ) {}

  // 同一 API 实例内保证一个 Run 只有一个 Executor，数据库 start CAS 负责最终所有权确认。
  start(runId: string): void {
    if (this.executions.has(runId)) return;
    const execution = this.execute(runId).finally(() => this.executions.delete(runId));
    this.executions.set(runId, execution);
  }

  async onModuleDestroy(): Promise<void> {
    // 当前不支持 Runtime resume，进程关闭时主动 abort，并让 catch 路径收敛为 RUN_INTERRUPTED。
    this.shuttingDown = true;
    for (const run of this.registry.values()) run.abortController.abort();
    await Promise.allSettled(this.executions.values());
  }

  private async execute(runId: string): Promise<void> {
    const active = this.registry.get(runId);
    const stored = await this.repository.findOwned(runId);
    if (!active || !stored) return;
    const model = this.config.get<string>(ENV_KEYS.openAiModel) ?? 'unknown';
    // projection 是 Chat 业务状态；active.liveSnapshot 是加上 Run status/sequence 的传输快照。
    let projection: ChatProjectionSnapshot = {
      model,
      blocks: [],
      toolCallCount: 0,
      executions: [],
      sources: [],
    };
    let draftVersion = 0;
    let lastFlushAt = Date.now();
    let lastFlushLength = 0;
    let stepSequence = 1;
    const toolSteps = new Map<string, string>();
    const modelStepId = crypto.randomUUID();
    const heartbeat = setInterval(() => void this.repository.heartbeat(runId), 5_000);
    try {
      // queued -> running 使用数据库 CAS；失败说明取消或其他执行者已经抢先改变状态。
      const started = await this.repository.start(runId);
      if (!started) {
        const latest = await this.repository.snapshot(runId);
        if (latest) this.events.updateSnapshot(runId, latest);
        return;
      }
      await this.repository.createStep({
        id: modelStepId,
        runId,
        sequence: stepSequence++,
        kind: 'model',
      });
      const startedEvent = this.events.publish(runId, 'run.started', { status: 'running' });
      if (startedEvent)
        active.liveSnapshot = {
          ...active.liveSnapshot,
          status: 'running',
          startedAt: new Date().toISOString(),
          lastEventSequence: startedEvent.seq,
        };
      const messages = await this.loadContext(stored.sessionId, stored.inputMessageId);
      for await (const event of this.chat.streamPrepared(
        {
          sessionId: stored.sessionId,
          userMessageId: stored.inputMessageId,
          assistantMessageId: stored.assistantMessageId,
          messages,
        },
        active.abortController.signal,
        {
          persistFinal: false,
          // ChatService 在 yield Event 前交付对应完整 Projection，保证下方 commit 后能写入同版本状态。
          onProjection: async (next) => {
            projection = next;
          },
        },
      )) {
        if (event.type === 'message.completed') continue;
        if (event.type === 'stream.failed') throw new Error(event.detail);
        // 用户可见变化统一遵循：分配 seq -> 更新 Live Snapshot -> 写 Tail -> 广播。
        // Projection 已由 onProjection 准备好，因此 Event 与 Snapshot 不会跨版本。
        const published = this.events.commit(runId, event.type, event);
        if (published) {
          this.updateLiveSnapshot(active.liveSnapshot, projection, published.seq);
          this.events.broadcast(runId, published);
        }
        await this.persistSemanticBoundary(runId, event, toolSteps, () => stepSequence++);
        const length = this.contentLength(projection);
        // Tool 生命周期等语义边界立即 Checkpoint；纯文本按时间或增量大小批量落库，
        // 在首字速度、数据库写放大和刷新恢复粒度之间取平衡。
        if (
          event.type !== 'message.delta' ||
          Date.now() - lastFlushAt >= 1_000 ||
          length - lastFlushLength >= 1_024
        ) {
          draftVersion += 1;
          // 写库前捕获不可变版本；异步事务期间产生的新 Event 只进入后续 Tail，不能混入本次水位。
          const checkpoint = structuredClone(active.liveSnapshot);
          const committed = await this.repository.flush(
            runId,
            stored.assistantMessageId,
            projection,
            checkpoint.lastEventSequence,
            draftVersion,
          );
          if (committed) this.events.checkpointCommitted(runId, checkpoint, draftVersion);
          lastFlushAt = Date.now();
          lastFlushLength = length;
        }
      }
      await this.repository.finishStep(runId, modelStepId, 'completed');
      // Terminal Event 特殊处理：先在内存分配精确 seq，但在数据库 CAS 成功前绝不广播成功。
      const previousSnapshot = structuredClone(active.liveSnapshot);
      const terminal = this.events.commit(runId, 'run.completed', { status: 'completed' });
      if (!terminal) return;
      this.updateLiveSnapshot(active.liveSnapshot, projection, terminal.seq, 'completed');
      draftVersion += 1;
      const terminalCommitted = await this.repository.terminal({
        runId,
        assistantMessageId: stored.assistantMessageId,
        status: 'completed',
        projection,
        lastEventSequence: terminal.seq,
        draftVersion,
      });
      if (!terminalCommitted) {
        // CAS 冲突说明合法终态已被其他竞争路径占用；撤销尚未广播的内存终态。
        this.events.rollback(runId, terminal, previousSnapshot);
        throw new Error('TERMINAL_CHECKPOINT_CONFLICT');
      }
      this.events.checkpointCommitted(runId, active.liveSnapshot, draftVersion);
      this.events.broadcast(runId, terminal);
      void this.generateFirstTitle(stored.sessionId);
    } catch (error) {
      // 用户取消与进程关闭使用同一个 AbortSignal，但必须映射为不同、不可混淆的终态原因。
      const cancelled = active.abortController.signal.aborted && !this.shuttingDown;
      const status = cancelled ? 'cancelled' : 'failed';
      const failure = cancelled
        ? { code: 'RUN_CANCELLED', detail: '用户已取消本次运行。' }
        : this.shuttingDown
          ? { code: 'RUN_INTERRUPTED', detail: '服务已停止，本次运行未自动恢复。' }
          : this.describeError(error);
      await this.repository.finishStep(runId, modelStepId, status, undefined, failure).catch(() => undefined);
      const previousSnapshot = structuredClone(active.liveSnapshot);
      const terminal = this.events.commit(
        runId,
        cancelled ? 'run.cancelled' : 'run.failed',
        failure,
      );
      if (!terminal) return;
      this.updateLiveSnapshot(active.liveSnapshot, projection, terminal.seq, status, failure);
      draftVersion += 1;
      const terminalCommitted = await this.repository.terminal({
        runId,
        assistantMessageId: stored.assistantMessageId,
        status,
        projection,
        lastEventSequence: terminal.seq,
        draftVersion,
        error: failure,
      });
      if (terminalCommitted) {
        this.events.checkpointCommitted(runId, active.liveSnapshot, draftVersion);
        this.events.broadcast(runId, terminal);
      } else {
        this.events.rollback(runId, terminal, previousSnapshot);
        throw new Error('TERMINAL_CHECKPOINT_CONFLICT');
      }
    } finally {
      clearInterval(heartbeat);
      // 先关闭 SSE，再短暂保留 Active Run，允许刚错过 terminal 的客户端读取最终 Live Snapshot。
      this.events.close(runId);
      setTimeout(() => this.registry.remove(runId), 60_000).unref();
    }
  }

  private async loadContext(sessionId: string, inputMessageId: string): Promise<ChatMessage[]> {
    // 多轮上下文只包含用户消息和已完成 Assistant 消息；失败/取消/流式草稿不能污染下一 Run。
    const messages = await this.prisma.message.findMany({
      where: {
        sessionId,
        OR: [
          { role: 'user' },
          {
            role: 'assistant',
            metadata: { path: ['deliveryStatus'], equals: 'completed' },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CHAT_CONTEXT_MESSAGE_LIMIT,
    });
    if (!messages.some((message) => message.id === inputMessageId)) {
      const current = await this.prisma.message.findUnique({ where: { id: inputMessageId } });
      if (current) messages.unshift(current);
    }
    return messages.sort(compareMessageOrder).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  private async persistSemanticBoundary(
    runId: string,
    event: ChatStreamEvent,
    toolSteps: Map<string, string>,
    nextSequence: () => number,
  ): Promise<void> {
    // Step 是诊断/观测记录，不是 Runtime 恢复点；真正可恢复的是 Run UI Checkpoint。
    if (event.type === 'tool.started') {
      const stepId = crypto.randomUUID();
      toolSteps.set(event.toolCallId, stepId);
      await this.repository.createStep({
        id: stepId,
        runId,
        sequence: nextSequence(),
        kind: 'tool',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        toolInput: event.input,
      });
    } else if (
      event.type === 'tool.completed' ||
      event.type === 'tool.failed' ||
      event.type === 'tool.cancelled'
    ) {
      const stepId = toolSteps.get(event.toolCallId);
      if (!stepId) return;
      await this.repository.finishStep(
        runId,
        stepId,
        event.type === 'tool.completed'
          ? 'completed'
          : event.type === 'tool.cancelled'
            ? 'cancelled'
            : 'failed',
        event.type === 'tool.completed' ? event.result : undefined,
        event.type === 'tool.failed' || event.type === 'tool.cancelled'
          ? { code: event.code, detail: event.detail }
          : undefined,
      );
    }
  }

  private updateLiveSnapshot(
    snapshot: RunSnapshot,
    projection: ChatProjectionSnapshot,
    seq = snapshot.lastEventSequence,
    status = snapshot.status,
    error?: { code: string; detail: string },
  ): void {
    // 保持原对象引用，ActiveRunRegistry 与 EventHub 始终观察同一 Live Snapshot 实例。
    Object.assign(snapshot, {
      status,
      assistantContent: projection.blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.content)
        .join(''),
      blocks: projection.blocks,
      executions: projection.executions,
      sources: projection.sources,
      toolCallCount: projection.toolCallCount,
      lastEventSequence: seq,
      ...(error ? { error } : {}),
    });
  }

  private contentLength(projection: ChatProjectionSnapshot): number {
    return projection.blocks
      .filter((block) => block.type === 'text')
      .reduce((total, block) => total + block.content.length, 0);
  }

  private describeError(error: unknown): { code: string; detail: string } {
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const response = (error as { response?: unknown }).response;
      if (typeof response === 'object' && response !== null) {
        const value = response as { code?: unknown; detail?: unknown };
        if (typeof value.code === 'string' && typeof value.detail === 'string')
          return { code: value.code, detail: value.detail };
      }
    }
    return { code: 'MODEL_STREAM_FAILED', detail: '模型流式输出失败，请稍后重试。' };
  }

  private async generateFirstTitle(sessionId: string): Promise<void> {
    const messages = await this.prisma.message.findMany({
      where: { sessionId, role: { in: ['user', 'assistant'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const firstUser = messages.find((message) => message.role === 'user');
    const completedAssistants = messages.filter((message) => {
      if (message.role !== 'assistant' || typeof message.metadata !== 'object' || !message.metadata)
        return false;
      return (message.metadata as Record<string, unknown>).deliveryStatus === 'completed';
    });
    if (!firstUser || completedAssistants.length !== 1) return;
    try {
      const title = await this.titles.generate(firstUser.content, completedAssistants[0]!.content);
      await this.prisma.session.update({ where: { id: sessionId }, data: { title } });
    } catch {
      // 标题是非关键后处理，失败时保留创建会话时的临时标题。
    }
  }
}
