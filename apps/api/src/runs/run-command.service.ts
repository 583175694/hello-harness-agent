import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AGENT_ERROR_CODES, type CreateRunResponse } from '@harness/agent-protocol';
import type { ChatProjectionSnapshot } from '../chat/chat.service';
import { ActiveRunRegistry } from './active-run.registry';
import { RunEventHub } from './run-event-hub';
import { RunExecutor } from './run.executor';
import { RunRepository } from './run.repository';

@Injectable()
export class RunCommandService {
  constructor(
    @Inject(RunRepository) private readonly repository: RunRepository,
    @Inject(ActiveRunRegistry) private readonly registry: ActiveRunRegistry,
    @Inject(RunEventHub) private readonly events: RunEventHub,
    @Inject(RunExecutor) private readonly executor: RunExecutor,
  ) {}

  // 校验请求并创建 Run；成功后注册初始 Snapshot，异步交给 Executor 执行。
  // 在数据库事务中创建 Run、User Message 和空 Assistant Draft，再异步启动 Executor。
  // HTTP 请求只负责“可靠接单”，不会持有到模型生成结束。
  async create(
    sessionId: string,
    input: { content: string; idempotencyKey: string },
  ): Promise<CreateRunResponse> {
    const runId = crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    // idempotencyKey 只能重放同一 payload；相同键搭配不同正文必须明确冲突。
    const payloadHash = createHash('sha256').update(input.content).digest('hex');
    let result;
    try {
      result = await this.repository.create({
        sessionId,
        content: input.content,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        runId,
        userMessageId,
        assistantMessageId,
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const existing = await this.repository.findByIdempotency(sessionId, input.idempotencyKey);
        if (existing) {
          if (existing.payloadHash !== payloadHash)
            throw new ConflictException({
              code: AGENT_ERROR_CODES.idempotencyConflict,
              detail: '相同幂等键已用于不同的请求内容。',
            });
          result = { kind: 'existing' as const, run: existing };
        } else throw this.busy();
      } else throw error;
    }
    if (result.kind === 'not_found')
      throw new NotFoundException({
        code: AGENT_ERROR_CODES.sessionNotFound,
        detail: '会话不存在。',
      });
    if (result.kind === 'conflict')
      throw new ConflictException({
        code: AGENT_ERROR_CODES.idempotencyConflict,
        detail: '相同幂等键已用于不同的请求内容。',
      });
    if (result.kind === 'busy') throw this.busy();
    const run = result.run;
    const snapshot = await this.repository.snapshot(run.id);
    if (!snapshot) throw new Error('CreatedRunSnapshotMissing');
    if (result.kind === 'created') {
      // 先注册初始 Durable Snapshot，再让后台 Executor 发布第一个事件，避免首订阅找不到 Run。
      this.registry.register(snapshot);
      setImmediate(() => this.executor.start(run.id));
    }
    return {
      sessionId: run.sessionId,
      runId: run.id,
      userMessageId: run.inputMessageId,
      assistantMessageId: run.assistantMessageId,
      status: run.status,
      eventsUrl: `/api/agent/runs/${run.id}/events`,
    };
  }

  // 返回当前进程最新 Snapshot；没有内存 Run 时退回数据库 Snapshot。
  async snapshot(runId: string) {
    const snapshot = await this.repository.snapshot(runId);
    if (!snapshot) this.notFound();
    // Active Run 优先返回进程内 Latest Snapshot；Registry 不存在时退回 PostgreSQL Checkpoint。
    const live = this.registry.get(runId)?.liveSnapshot;
    return live ?? snapshot;
  }

  // 请求取消 Run，并根据当前执行位置选择立即终止或交给 Executor 收尾。
  async cancel(runId: string) {
    const snapshot = await this.repository.snapshot(runId);
    if (!snapshot) this.notFound();
    if (
      snapshot.status === 'completed' ||
      snapshot.status === 'failed' ||
      snapshot.status === 'cancelled'
    )
      return { runId, status: snapshot.status };
    const requestedStatus = await this.repository.requestCancel(runId);
    if (requestedStatus === 'cancelled') {
      // queued Run 尚未进入 Runtime，Repository 已直接持久化 cancelled；内存中只补交终态观察事件。
      const active = this.registry.get(runId);
      if (active) {
        const cancelled = this.events.commit(runId, 'run.cancelled', {
          code: 'RUN_CANCELLED',
          detail: '用户已取消本次运行。',
        });
        if (cancelled) this.events.broadcast(runId, cancelled);
      }
      return { runId, status: requestedStatus };
    }
    if (requestedStatus !== 'cancel_requested') return { runId, status: requestedStatus };
    const active = this.registry.get(runId);
    if (active) {
      // running Run 先公开 cancel_requested，再 abort 本地 Runtime，由 Executor 持久化最终 cancelled。
      this.events.publish(runId, 'run.cancel_requested', { status: 'cancel_requested' });
      active.abortController.abort();
      return { runId, status: 'cancel_requested' as const };
    }
    // 本实例没有 Executor 时无法等待本地 catch 收尾，直接用 Durable Snapshot 收敛取消状态。
    const projection: ChatProjectionSnapshot = {
      model: 'unknown',
      blocks: snapshot.blocks,
      executions: snapshot.executions,
      sources: snapshot.sources,
      toolCallCount: snapshot.toolCallCount,
    };
    await this.repository.terminal({
      runId,
      assistantMessageId: snapshot.assistantMessageId,
      status: 'cancelled',
      projection,
      lastEventSequence: snapshot.lastEventSequence,
      draftVersion: 1,
      error: { code: 'RUN_CANCELLED', detail: '用户已取消本次运行。' },
    });
    return { runId, status: 'cancelled' as const };
  }

  // 创建 Session 忙碌错误，供多个入口复用。
  private busy(): ConflictException {
    return new ConflictException({
      code: AGENT_ERROR_CODES.sessionBusy,
      detail: '该会话已有一个正在执行的 Run。',
    });
  }

  // 创建 Run 不存在错误。
  private notFound(): never {
    throw new NotFoundException({
      code: AGENT_ERROR_CODES.runNotFound,
      detail: 'Run 不存在。',
    });
  }
}
