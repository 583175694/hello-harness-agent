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

  start(runId: string): void {
    if (this.executions.has(runId)) return;
    const execution = this.execute(runId).finally(() => this.executions.delete(runId));
    this.executions.set(runId, execution);
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    for (const run of this.registry.values()) run.abortController.abort();
    await Promise.allSettled(this.executions.values());
  }

  private async execute(runId: string): Promise<void> {
    const active = this.registry.get(runId);
    const stored = await this.repository.findOwned(runId);
    if (!active || !stored) return;
    const model = this.config.get<string>(ENV_KEYS.openAiModel) ?? 'unknown';
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
      if (startedEvent) active.snapshot = { ...active.snapshot, status: 'running', startedAt: new Date().toISOString(), lastEventSequence: startedEvent.seq };
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
          onProjection: async (next) => {
            projection = next;
            this.updateLiveSnapshot(active.snapshot, projection);
            const length = this.contentLength(projection);
            if (Date.now() - lastFlushAt >= 1_000 || length - lastFlushLength >= 1_024) {
              draftVersion += 1;
              await this.repository.flush(
                runId,
                stored.assistantMessageId,
                projection,
                active.nextSequence - 1,
                draftVersion,
              );
              lastFlushAt = Date.now();
              lastFlushLength = length;
            }
          },
        },
      )) {
        if (event.type === 'message.completed') continue;
        if (event.type === 'stream.failed') throw new Error(event.detail);
        const published = this.events.publish(runId, event.type, event);
        if (published) this.updateLiveSnapshot(active.snapshot, projection, published.seq);
        await this.persistSemanticBoundary(runId, event, toolSteps, () => stepSequence++);
        if (event.type !== 'message.delta') {
          draftVersion += 1;
          await this.repository.flush(
            runId,
            stored.assistantMessageId,
            projection,
            active.nextSequence - 1,
            draftVersion,
          );
        }
      }
      await this.repository.finishStep(runId, modelStepId, 'completed');
      const terminalSequence = active.nextSequence;
      draftVersion += 1;
      await this.repository.terminal({
        runId,
        assistantMessageId: stored.assistantMessageId,
        status: 'completed',
        projection,
        lastEventSequence: terminalSequence,
        draftVersion,
      });
      const terminal = this.events.publish(runId, 'run.completed', { status: 'completed' });
      this.updateLiveSnapshot(active.snapshot, projection, terminal?.seq, 'completed');
      void this.generateFirstTitle(stored.sessionId);
    } catch (error) {
      const cancelled = active.abortController.signal.aborted && !this.shuttingDown;
      const status = cancelled ? 'cancelled' : 'failed';
      const failure = cancelled
        ? { code: 'RUN_CANCELLED', detail: '用户已取消本次运行。' }
        : this.shuttingDown
          ? { code: 'RUN_INTERRUPTED', detail: '服务已停止，本次运行未自动恢复。' }
          : this.describeError(error);
      await this.repository.finishStep(runId, modelStepId, status, undefined, failure).catch(() => undefined);
      const terminalSequence = active.nextSequence;
      draftVersion += 1;
      await this.repository.terminal({
        runId,
        assistantMessageId: stored.assistantMessageId,
        status,
        projection,
        lastEventSequence: terminalSequence,
        draftVersion,
        error: failure,
      });
      const terminal = this.events.publish(runId, cancelled ? 'run.cancelled' : 'run.failed', failure);
      this.updateLiveSnapshot(active.snapshot, projection, terminal?.seq, status, failure);
    } finally {
      clearInterval(heartbeat);
      this.events.close(runId);
      setTimeout(() => this.registry.remove(runId), 60_000).unref();
    }
  }

  private async loadContext(sessionId: string, inputMessageId: string): Promise<ChatMessage[]> {
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
