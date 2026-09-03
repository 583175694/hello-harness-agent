import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assistantAgentMetadataSchema,
  runObservabilitySchema,
  type AgentRunStatus,
  type RunContextDebug,
  type RunSnapshot,
} from '@harness/agent-protocol';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { PrismaService } from '../database/prisma.service';
import type { ChatProjectionSnapshot } from '../chat/chat.service';
import type { ModelMessage, ModelToolCall } from '../model/model-adapter';
import type { CompactionState } from '../context-engineering/context-engineering.types';
import type { AgentRuntimeEvent } from '../agent-runtime/agent-runtime.types';

const ACTIVE_STATUSES = ['queued', 'running', 'cancel_requested'] as const;

@Injectable()
export class RunRepository implements OnModuleInit, OnModuleDestroy {
  // ownerInstanceId 只用于当前单进程执行隔离和重启清理，不等同于分布式 Worker fencing token。
  readonly instanceId = crypto.randomUUID();
  private reconciliationTimer?: NodeJS.Timeout;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // 启动时收敛遗留 Active Run，并启动过期 heartbeat 检查。
  async onModuleInit(): Promise<void> {
    // 当前范围不恢复 Runtime：启动时把其他实例遗留的 Active Run 明确收敛为 failed。
    await this.interruptRuns({ status: { in: [...ACTIVE_STATUSES] } });
    this.reconciliationTimer = setInterval(() => {
      const staleBefore = new Date(Date.now() - 30_000);
      void this.interruptRuns(
        {
          status: { in: [...ACTIVE_STATUSES] },
          OR: [
            { heartbeatAt: { lt: staleBefore } },
            { heartbeatAt: null, createdAt: { lt: staleBefore } },
          ],
        },
        false,
      );
    }, 30_000);
    this.reconciliationTimer.unref();
  }

  // 停止后台 reconciliation 定时器。
  onModuleDestroy(): void {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  // 将不属于当前实例或已失联的 Active Run 标记为中断失败。
  private async interruptRuns(
    where: Prisma.AgentRunWhereInput,
    excludeCurrentOwner = true,
  ): Promise<void> {
    // 排除当前实例仍持有并持续 heartbeat 的 Run，避免 reconciliation 杀死本地正常执行。
    const interrupted = await this.prisma.agentRun.findMany({
      where: {
        AND: [
          where,
          ...(excludeCurrentOwner ? [{ NOT: { ownerInstanceId: this.instanceId } }] : []),
        ],
      },
      include: { messages: { where: { role: 'assistant' } } },
    });
    for (const run of interrupted) {
      const message = run.messages.find((item) => item.id === run.assistantMessageId);
      const metadata = this.metadata(message?.metadata);
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.agentRun.updateMany({
          where: { id: run.id, status: { in: [...ACTIVE_STATUSES] } },
          data: {
            status: 'failed',
            errorCode: 'RUN_INTERRUPTED',
            errorDetail: '服务已重启，本次运行未自动恢复。',
            endedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) return;
        if (message) {
          await tx.message.update({
            where: { id: message.id },
            data: {
              metadata: {
                ...metadata,
                deliveryStatus: 'failed',
                runId: run.id,
              } as Prisma.InputJsonValue,
            },
          });
        }
        await tx.modelTranscriptItem.deleteMany({
          where: { runId: run.id, state: 'active' },
        });
      });
    }
  }

  // 立即收敛指定会话中已经失联的 Run，供删除等管理操作复用。
  async interruptStaleForSession(sessionId: string): Promise<void> {
    const staleBefore = new Date(Date.now() - 30_000);
    await this.interruptRuns(
      {
        sessionId,
        status: { in: [...ACTIVE_STATUSES] },
        OR: [
          { heartbeatAt: { lt: staleBefore } },
          { heartbeatAt: null, createdAt: { lt: staleBefore } },
        ],
      },
      false,
    );
  }

  // 进程内 Executor 意外退出时的最后一道数据库兜底，避免 Run 永久停留在 active。
  async forceFail(
    runId: string,
    assistantMessageId: string,
    failure: { code: string; detail: string },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: { id: runId, status: { in: [...ACTIVE_STATUSES] } },
        data: {
          status: 'failed',
          errorCode: failure.code,
          errorDetail: failure.detail,
          activeStepId: null,
          endedAt: new Date(),
          heartbeatAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;
      const message = await tx.message.findUnique({ where: { id: assistantMessageId } });
      if (message) {
        await tx.message.update({
          where: { id: assistantMessageId },
          data: {
            metadata: {
              ...this.metadata(message.metadata),
              deliveryStatus: 'failed',
              runId,
            } as Prisma.InputJsonValue,
          },
        });
      }
      await tx.modelTranscriptItem.deleteMany({ where: { runId, state: 'active' } });
      return true;
    });
  }

  // 在一个事务中完成 Session 校验、幂等检查、并发检查和 Run 初始化。
  async create(input: {
    sessionId: string;
    content: string;
    idempotencyKey: string;
    payloadHash: string;
    runId: string;
    userMessageId: string;
    assistantMessageId: string;
    pendingInputId?: string;
    provider: string;
    model: string;
    reasoningEffort: string;
    reasoningFormat?: string;
  }) {
    // Session 校验、幂等判定、单 Session Active Run 限制和两条初始消息必须同事务完成。
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { id: input.sessionId, userId: LOCAL_USER_ID },
      });
      if (!session) return { kind: 'not_found' as const };
      const existing = await tx.agentRun.findUnique({
        where: {
          sessionId_idempotencyKey: {
            sessionId: input.sessionId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing)
        return existing.payloadHash === input.payloadHash
          ? { kind: 'existing' as const, run: existing }
          : { kind: 'conflict' as const };
      const active = await tx.agentRun.findFirst({
        where: { sessionId: input.sessionId, status: { in: [...ACTIVE_STATUSES] } },
      });
      if (active) return { kind: 'busy' as const };
      const lastTranscript = await tx.modelTranscriptItem.findFirst({
        where: { sessionId: input.sessionId },
        orderBy: { sequence: 'desc' },
      });
      const firstSequence = (lastTranscript?.sequence ?? 0) + 1;
      const run = await tx.agentRun.create({
        data: {
          id: input.runId,
          sessionId: input.sessionId,
          inputMessageId: input.userMessageId,
          assistantMessageId: input.assistantMessageId,
          idempotencyKey: input.idempotencyKey,
          payloadHash: input.payloadHash,
          provider: input.provider,
          model: input.model,
          reasoningEffort: input.reasoningEffort,
          reasoningFormat: input.reasoningFormat,
          messages: {
            create: [
              {
                id: input.userMessageId,
                userId: LOCAL_USER_ID,
                sessionId: input.sessionId,
                role: 'user',
                kind: 'user_message',
                content: input.content,
                ...(input.pendingInputId
                  ? { metadata: { pendingInputId: input.pendingInputId } }
                  : {}),
              },
              {
                id: input.assistantMessageId,
                userId: LOCAL_USER_ID,
                sessionId: input.sessionId,
                role: 'assistant',
                kind: 'assistant_delivery',
                content: '',
                metadata: {
                  deliveryStatus: 'streaming',
                  runId: input.runId,
                  draftVersion: 0,
                  lastEventSequence: 0,
                  blocks: [],
                },
              },
            ],
          },
        },
      });
      await tx.modelTranscriptItem.create({
        data: {
          id: crypto.randomUUID(),
          sessionId: input.sessionId,
          runId: input.runId,
          messageId: input.userMessageId,
          sequence: firstSequence,
          runSequence: 1,
          kind: 'user',
          state: 'active',
          content: input.content,
          provider: input.provider,
          model: input.model,
          reasoningEffort: input.reasoningEffort,
          reasoningFormat: input.reasoningFormat,
        },
      });
      await tx.session.update({ where: { id: input.sessionId }, data: { updatedAt: new Date() } });
      return { kind: 'created' as const, run };
    });
  }

  // 查询当前用户拥有的 Run，并带出 Assistant 消息。
  async findOwned(runId: string) {
    return this.prisma.agentRun.findFirst({
      where: { id: runId, session: { userId: LOCAL_USER_ID } },
      include: { messages: { where: { role: 'assistant' } } },
    });
  }

  // 根据幂等键查询当前用户在指定 Session 下的历史 Run。
  async findByIdempotency(sessionId: string, idempotencyKey: string) {
    return this.prisma.agentRun.findFirst({
      where: { sessionId, idempotencyKey, session: { userId: LOCAL_USER_ID } },
    });
  }

  async latestTerminalProfile(sessionId: string) {
    return this.prisma.agentRun.findFirst({
      where: { sessionId, status: { in: ['completed', 'failed', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
      select: { model: true, reasoningEffort: true },
    });
  }

  async claimFollowUp(sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.pendingUserInput.findFirst({
        where: { sessionId, kind: 'follow_up', status: 'pending' },
        orderBy: { sequence: 'asc' },
      });
      if (!row) return undefined;
      const result = await tx.pendingUserInput.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'consumed' },
      });
      return result.count ? row : undefined;
    });
  }

  // 从数据库中的 Run 和 Assistant Draft 组装可返回给客户端的 Snapshot。
  async snapshot(runId: string): Promise<RunSnapshot | undefined> {
    // PostgreSQL 保存完整 UI Snapshot，不保存可重放 Runtime Event Log。
    const run = await this.findOwned(runId);
    if (!run) return undefined;
    const message = run.messages.find((item) => item.id === run.assistantMessageId);
    const metadata = assistantAgentMetadataSchema.safeParse(this.metadata(message?.metadata));
    const value = metadata.success ? metadata.data : undefined;
    const observability = runObservabilitySchema.safeParse(
      this.metadata(run.metadata).observability,
    );
    const pendingUserInputs = await this.prisma.pendingUserInput.findMany({
      where: { sessionId: run.sessionId },
      orderBy: { sequence: 'asc' },
    });
    return {
      runId: run.id,
      sessionId: run.sessionId,
      status: run.status,
      profile: {
        provider: run.provider,
        model: run.model,
        reasoningEffort: run.reasoningEffort as NonNullable<
          RunSnapshot['profile']
        >['reasoningEffort'],
        ...(run.reasoningFormat ? { reasoningFormat: run.reasoningFormat } : {}),
      },
      assistantMessageId: run.assistantMessageId,
      assistantContent: message?.content ?? '',
      blocks: value?.blocks ?? [],
      executions: value?.agent?.executions ?? [],
      sources: value?.agent?.sources ?? [],
      toolCallCount: run.toolCallCount,
      lastEventSequence: Number(run.lastEventSequence),
      ...(value?.context ? { context: value.context } : {}),
      ...(value?.plan ? { plan: value.plan } : {}),
      ...(observability.success ? { observability: observability.data } : {}),
      ...(run.errorCode && run.errorDetail
        ? { error: { code: run.errorCode, detail: run.errorDetail } }
        : {}),
      createdAt: run.createdAt.toISOString(),
      ...(run.startedAt ? { startedAt: run.startedAt.toISOString() } : {}),
      ...(run.endedAt ? { endedAt: run.endedAt.toISOString() } : {}),
      pendingUserInputs: pendingUserInputs.map((input) => ({
        id: input.id,
        kind: input.kind,
        status: input.status,
        content: input.content,
        sequence: input.sequence,
      })),
    };
  }

  async loadTranscript(runId: string): Promise<ModelMessage[]> {
    const run = await this.prisma.agentRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error('RUN_NOT_FOUND');
    const items = await this.prisma.modelTranscriptItem.findMany({
      where: {
        sessionId: run.sessionId,
        OR: [{ state: 'committed' }, { runId, state: 'active' }],
      },
      orderBy: { sequence: 'asc' },
    });
    if (!items.some((item) => item.runId === runId && item.kind === 'user')) {
      throw new Error('MODEL_TRANSCRIPT_INTEGRITY_ERROR');
    }
    const committed = items.filter((item) => item.state === 'committed');
    const nativeReasoningItems = committed.filter(
      (item) =>
        item.kind === 'assistant' &&
        item.reasoning &&
        Array.isArray(item.toolCalls) &&
        item.toolCalls.length,
    );
    if (
      nativeReasoningItems.some(
        (item) => item.provider !== run.provider || item.reasoningFormat !== run.reasoningFormat,
      )
    ) {
      throw new Error('MODEL_TRANSCRIPT_INCOMPATIBLE');
    }
    this.assertCommittedTranscriptClosed(committed);
    return items.map((item): ModelMessage => {
      if (item.kind === 'user' || item.kind === 'clarification_response')
        return { role: 'user', content: item.content ?? '' };
      if (item.kind === 'tool_result') {
        const controlOutcome = this.readToolControlOutcome(item.metadata);
        return {
          role: 'tool',
          content: item.content ?? '',
          toolCallId: item.toolCallId ?? '',
          ...(controlOutcome ? { controlOutcome } : {}),
        };
      }
      return {
        role: 'assistant',
        content: item.content,
        ...(item.reasoning ? { reasoning: item.reasoning } : {}),
        ...(Array.isArray(item.toolCalls) ? { toolCalls: item.toolCalls as ModelToolCall[] } : {}),
      };
    });
  }

  private assertCommittedTranscriptClosed(
    items: Array<{ kind: string; toolCalls: Prisma.JsonValue | null; toolCallId: string | null }>,
  ): void {
    const calls = new Set<string>();
    const results = new Set<string>();
    for (const item of items) {
      if (item.kind === 'assistant' && Array.isArray(item.toolCalls)) {
        for (const call of item.toolCalls) {
          if (
            typeof call === 'object' &&
            call !== null &&
            'id' in call &&
            typeof call.id === 'string'
          )
            calls.add(call.id);
        }
      }
      if (item.kind === 'tool_result' && item.toolCallId) results.add(item.toolCallId);
    }
    if ([...results].some((id) => !calls.has(id)) || [...calls].some((id) => !results.has(id)))
      throw new Error('MODEL_TRANSCRIPT_INTEGRITY_ERROR');
  }

  async appendTranscriptItem(
    runId: string,
    message: ModelMessage,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (message.role === 'system') return;
    await this.prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findUnique({ where: { id: runId } });
      if (!run || !ACTIVE_STATUSES.includes(run.status as (typeof ACTIVE_STATUSES)[number])) return;
      const latest = await tx.modelTranscriptItem.findFirst({
        where: { sessionId: run.sessionId },
        orderBy: { sequence: 'desc' },
      });
      const runLatest = await tx.modelTranscriptItem.findFirst({
        where: { runId },
        orderBy: { runSequence: 'desc' },
      });
      await tx.modelTranscriptItem.create({
        data: {
          id: crypto.randomUUID(),
          sessionId: run.sessionId,
          runId,
          messageId: message.role === 'assistant' ? run.assistantMessageId : null,
          sequence: (latest?.sequence ?? 0) + 1,
          runSequence: (runLatest?.runSequence ?? 0) + 1,
          kind:
            message.role === 'assistant'
              ? 'assistant'
              : message.role === 'user'
                ? 'user'
                : 'tool_result',
          state: 'active',
          content: message.content,
          reasoning: message.role === 'assistant' ? message.reasoning : null,
          toolCalls:
            message.role === 'assistant' && message.toolCalls
              ? (message.toolCalls as unknown as Prisma.InputJsonValue)
              : undefined,
          toolCallId: message.role === 'tool' ? message.toolCallId : null,
          metadata: (metadata ??
            (message.role === 'tool' && message.controlOutcome
              ? { toolControlOutcome: message.controlOutcome }
              : undefined)) as Prisma.InputJsonValue | undefined,
          provider: run.provider,
          model: run.model,
          reasoningEffort: run.reasoningEffort,
          reasoningFormat: run.reasoningFormat,
        },
      });
    });
  }

  async appendTranscriptFact(
    runId: string,
    fact: Extract<AgentRuntimeEvent, { type: 'transcript.fact' }>['fact'],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findUnique({ where: { id: runId } });
      if (!run || !ACTIVE_STATUSES.includes(run.status as (typeof ACTIVE_STATUSES)[number])) return;
      const [latest, runLatest] = await Promise.all([
        tx.modelTranscriptItem.findFirst({
          where: { sessionId: run.sessionId },
          orderBy: { sequence: 'desc' },
        }),
        tx.modelTranscriptItem.findFirst({
          where: { runId },
          orderBy: { runSequence: 'desc' },
        }),
      ]);
      await tx.modelTranscriptItem.create({
        data: {
          id: crypto.randomUUID(),
          sessionId: run.sessionId,
          runId,
          messageId: fact.kind === 'clarification_request' ? run.assistantMessageId : null,
          sequence: (latest?.sequence ?? 0) + 1,
          runSequence: (runLatest?.runSequence ?? 0) + 1,
          kind: fact.kind,
          state: 'active',
          content:
            fact.kind === 'clarification_request'
              ? this.clarificationRequestContent(fact.request)
              : fact.answer,
          metadata: {
            interruptId: fact.interruptId,
            roundId: fact.roundId,
            roundSequence: fact.roundSequence,
            ...(fact.kind === 'clarification_request' ? { request: fact.request } : {}),
          } as Prisma.InputJsonValue,
          provider: run.provider,
          model: run.model,
          reasoningEffort: run.reasoningEffort,
          reasoningFormat: run.reasoningFormat,
        },
      });
    });
  }

  private clarificationRequestContent(
    request: import('@harness/agent-protocol').ClarificationRequest,
  ): string {
    const options = request.options.length
      ? `\n可选项：\n${request.options.map((option) => `- ${option}`).join('\n')}`
      : '';
    return `我需要用户补充信息后才能继续：${request.question}${options}`;
  }

  private readToolControlOutcome(
    metadata: Prisma.JsonValue | null,
  ): Extract<ModelMessage, { role: 'tool' }>['controlOutcome'] | undefined {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return;
    const outcome = metadata.toolControlOutcome;
    return outcome === 'approved_by_user' ||
      outcome === 'rejected_by_user' ||
      outcome === 'rejected_by_policy'
      ? outcome
      : undefined;
  }

  // 使用数据库 CAS 抢占 queued Run 的执行权。
  async start(runId: string): Promise<boolean> {
    // 只有 queued 能获得执行权；queued cancel 与 start 竞争时最多一个 updateMany 成功。
    const now = new Date();
    const result = await this.prisma.agentRun.updateMany({
      where: { id: runId, status: 'queued' },
      data: {
        status: 'running',
        startedAt: now,
        heartbeatAt: now,
        ownerInstanceId: this.instanceId,
        version: { increment: 1 },
      },
    });
    return result.count === 1;
  }

  // 更新 Active Run 的 heartbeat，供失联检测判断执行是否仍存活。
  async heartbeat(runId: string): Promise<void> {
    await this.prisma.agentRun.updateMany({
      where: { id: runId, status: { in: [...ACTIVE_STATUSES] } },
      data: { heartbeatAt: new Date(), version: { increment: 1 } },
    });
  }

  // 创建一个 Model 或 Tool Step，并把它设为当前 Active Step。
  async createStep(input: {
    id: string;
    runId: string;
    sequence: number;
    kind: 'model' | 'tool';
    toolCallId?: string;
    toolName?: string;
    toolInput?: unknown;
  }): Promise<void> {
    await this.prisma.agentRunStep.create({
      data: {
        id: input.id,
        runId: input.runId,
        sequence: input.sequence,
        kind: input.kind,
        status: 'running',
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        input:
          input.toolInput === undefined ? undefined : (input.toolInput as Prisma.InputJsonValue),
      },
    });
    await this.prisma.agentRun.update({
      where: { id: input.runId },
      data: { activeStepId: input.id, version: { increment: 1 } },
    });
  }

  // 完成 Step，保存结果或错误，并清除 Run 的当前 Active Step。
  async finishStep(
    runId: string,
    stepId: string,
    status: 'completed' | 'failed' | 'cancelled',
    output?: unknown,
    error?: { code: string; detail: string },
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.agentRunStep.update({
        where: { id: stepId },
        data: {
          status,
          endedAt: new Date(),
          output: output === undefined ? undefined : (output as Prisma.InputJsonValue),
          errorCode: error?.code,
          errorDetail: error?.detail,
        },
      }),
      this.prisma.agentRun.update({
        where: { id: runId },
        data: { activeStepId: null, version: { increment: 1 } },
      }),
    ]);
  }

  // 将当前 Projection 和事件水位批量写入 Assistant Draft Checkpoint。
  async flush(
    runId: string,
    assistantMessageId: string,
    projection: ChatProjectionSnapshot,
    lastEventSequence: number,
    draftVersion: number,
  ): Promise<boolean> {
    const content = projection.blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.content)
      .join('');
    // Run 水位和 Assistant Draft 在同一事务更新，禁止出现 seq 已前进但 Blocks 仍是旧版本。
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findUnique({ where: { id: assistantMessageId } });
      const currentMetadata = this.metadata(message?.metadata);
      const currentDraftVersion =
        typeof currentMetadata.draftVersion === 'number' ? currentMetadata.draftVersion : 0;
      // 较晚完成的旧写请求不能覆盖更新的 Draft；sequence 也只允许单调前进。
      if (currentDraftVersion > draftVersion) return false;
      const updated = await tx.agentRun.updateMany({
        where: {
          id: runId,
          status: { in: [...ACTIVE_STATUSES] },
          lastEventSequence: { lte: BigInt(lastEventSequence) },
        },
        data: {
          toolCallCount: projection.toolCallCount,
          lastEventSequence: BigInt(lastEventSequence),
          heartbeatAt: new Date(),
          metadata: { observability: projection.observability } as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;
      await tx.message.update({
        where: { id: assistantMessageId },
        data: {
          content,
          metadata: {
            model: projection.model,
            deliveryStatus: 'streaming',
            runId,
            draftVersion,
            lastEventSequence,
            blocks: projection.blocks,
            agent: {
              toolCallCount: projection.toolCallCount,
              executions: projection.executions,
              sources: projection.sources,
            },
            ...(projection.plan ? { plan: projection.plan } : {}),
          } as Prisma.InputJsonValue,
        },
      });
      return true;
    });
  }

  // 请求取消 Run；queued 直接终止，running 先进入 cancel_requested。
  async requestCancel(runId: string): Promise<AgentRunStatus> {
    // queued 尚未执行，可在事务内直接终止并更新 Draft；running 只能请求取消，由 Executor 收尾。
    const queued = await this.prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findFirst({ where: { id: runId, status: 'queued' } });
      if (!run) return false;
      const updated = await tx.agentRun.updateMany({
        where: { id: runId, status: 'queued' },
        data: {
          status: 'cancelled',
          errorCode: 'RUN_CANCELLED',
          errorDetail: '用户已取消本次运行。',
          endedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;
      const message = await tx.message.findUnique({ where: { id: run.assistantMessageId } });
      if (message) {
        await tx.message.update({
          where: { id: message.id },
          data: {
            metadata: {
              ...this.metadata(message.metadata),
              deliveryStatus: 'cancelled',
              runId,
            } as Prisma.InputJsonValue,
          },
        });
      }
      return true;
    });
    if (queued) return 'cancelled';
    const result = await this.prisma.agentRun.updateMany({
      where: { id: runId, status: 'running' },
      data: { status: 'cancel_requested', version: { increment: 1 } },
    });
    if (result.count === 1) return 'cancel_requested';
    const run = await this.prisma.agentRun.findUnique({ where: { id: runId } });
    return run?.status ?? 'failed';
  }

  // 使用状态 CAS 原子提交 Run 终态和最终 Assistant Snapshot。
  async terminal(input: {
    runId: string;
    assistantMessageId: string;
    status: 'completed' | 'failed' | 'cancelled';
    projection: ChatProjectionSnapshot;
    lastEventSequence: number;
    draftVersion: number;
    context?: RunContextDebug;
    compactionState?: CompactionState;
    error?: { code: string; detail: string };
  }): Promise<boolean> {
    const content = input.projection.blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.content)
      .join('');
    // 完成只能来自 running；一旦进入 cancel_requested，成功终态必须让位于 cancelled/failed。
    const allowedFrom =
      input.status === 'completed'
        ? ['running']
        : input.status === 'cancelled'
          ? ['cancel_requested']
          : ['running', 'cancel_requested'];
    // Terminal Run 状态和最终 Assistant Snapshot 原子提交，成功返回后才允许广播 terminal SSE。
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.agentRun.updateMany({
        where: {
          id: input.runId,
          status: { in: allowedFrom as AgentRunStatus[] },
          lastEventSequence: { lte: BigInt(input.lastEventSequence) },
        },
        data: {
          status: input.status,
          toolCallCount: input.projection.toolCallCount,
          lastEventSequence: BigInt(input.lastEventSequence),
          errorCode: input.error?.code,
          errorDetail: input.error?.detail,
          activeStepId: null,
          endedAt: new Date(),
          heartbeatAt: new Date(),
          metadata: { observability: input.projection.observability } as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;
      if (input.status === 'completed') {
        if (input.compactionState) {
          const run = await tx.agentRun.findUnique({
            where: { id: input.runId },
            select: { sessionId: true },
          });
          if (!run) throw new Error('RUN_NOT_FOUND_DURING_TERMINAL_COMMIT');
          await tx.contextCompactionState.upsert({
            where: { sessionId: run.sessionId },
            create: {
              id: crypto.randomUUID(),
              sessionId: run.sessionId,
              ...input.compactionState,
            },
            update: {
              summary: input.compactionState.summary,
              coveredMessageCount: input.compactionState.coveredMessageCount,
              coveredThroughItemId: input.compactionState.coveredThroughItemId,
              version: input.compactionState.version,
              tokenCount: input.compactionState.tokenCount,
            },
          });
        }
        await tx.modelTranscriptItem.updateMany({
          where: { runId: input.runId, state: 'active' },
          data: { state: 'committed' },
        });
      } else {
        await tx.modelTranscriptItem.deleteMany({
          where: { runId: input.runId, state: 'active' },
        });
      }
      await tx.message.update({
        where: { id: input.assistantMessageId },
        data: {
          content,
          metadata: {
            model: input.projection.model,
            deliveryStatus: input.status,
            runId: input.runId,
            draftVersion: input.draftVersion,
            lastEventSequence: input.lastEventSequence,
            blocks: input.projection.blocks,
            ...(input.context ? { context: input.context } : {}),
            agent: {
              toolCallCount: input.projection.toolCallCount,
              executions: input.projection.executions,
              sources: input.projection.sources,
            },
            ...(input.projection.plan ? { plan: input.projection.plan } : {}),
          } as Prisma.InputJsonValue,
        },
      });
      return true;
    });
  }

  // 将 Prisma JSON 值安全转换为普通对象，供 metadata 合并使用。
  private metadata(value: Prisma.JsonValue | undefined): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
