import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assistantAgentMetadataSchema,
  type AgentRunStatus,
  type RunSnapshot,
} from '@harness/agent-protocol';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { PrismaService } from '../database/prisma.service';
import type { ChatProjectionSnapshot } from '../chat/chat.service';

const ACTIVE_STATUSES = ['queued', 'running', 'cancel_requested'] as const;

@Injectable()
export class RunRepository implements OnModuleInit, OnModuleDestroy {
  readonly instanceId = crypto.randomUUID();
  private reconciliationTimer?: NodeJS.Timeout;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.interruptRuns({ status: { in: [...ACTIVE_STATUSES] } });
    this.reconciliationTimer = setInterval(() => {
      const staleBefore = new Date(Date.now() - 30_000);
      void this.interruptRuns({
        status: { in: [...ACTIVE_STATUSES] },
        OR: [
          { heartbeatAt: { lt: staleBefore } },
          { heartbeatAt: null, createdAt: { lt: staleBefore } },
        ],
      });
    }, 30_000);
    this.reconciliationTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  private async interruptRuns(where: Prisma.AgentRunWhereInput): Promise<void> {
    const interrupted = await this.prisma.agentRun.findMany({
      where,
      include: { messages: { where: { role: 'assistant' } } },
    });
    for (const run of interrupted) {
      const message = run.messages.find((item) => item.id === run.assistantMessageId);
      const metadata = this.metadata(message?.metadata);
      await this.prisma.$transaction([
        this.prisma.agentRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            errorCode: 'RUN_INTERRUPTED',
            errorDetail: '服务已重启，本次运行未自动恢复。',
            endedAt: new Date(),
            version: { increment: 1 },
          },
        }),
        ...(message
          ? [
              this.prisma.message.update({
                where: { id: message.id },
                data: {
                  metadata: {
                    ...metadata,
                    deliveryStatus: 'failed',
                    runId: run.id,
                  } as Prisma.InputJsonValue,
                },
              }),
            ]
          : []),
      ]);
    }
  }

  async create(input: {
    sessionId: string;
    content: string;
    idempotencyKey: string;
    payloadHash: string;
    runId: string;
    userMessageId: string;
    assistantMessageId: string;
  }) {
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
      const run = await tx.agentRun.create({
        data: {
          id: input.runId,
          sessionId: input.sessionId,
          inputMessageId: input.userMessageId,
          assistantMessageId: input.assistantMessageId,
          idempotencyKey: input.idempotencyKey,
          payloadHash: input.payloadHash,
          messages: {
            create: [
              {
                id: input.userMessageId,
                userId: LOCAL_USER_ID,
                sessionId: input.sessionId,
                role: 'user',
                kind: 'user_message',
                content: input.content,
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
      await tx.session.update({ where: { id: input.sessionId }, data: { updatedAt: new Date() } });
      return { kind: 'created' as const, run };
    });
  }

  async findOwned(runId: string) {
    return this.prisma.agentRun.findFirst({
      where: { id: runId, session: { userId: LOCAL_USER_ID } },
      include: { messages: { where: { role: 'assistant' } } },
    });
  }

  async findByIdempotency(sessionId: string, idempotencyKey: string) {
    return this.prisma.agentRun.findFirst({
      where: { sessionId, idempotencyKey, session: { userId: LOCAL_USER_ID } },
    });
  }

  async snapshot(runId: string): Promise<RunSnapshot | undefined> {
    const run = await this.findOwned(runId);
    if (!run) return undefined;
    const message = run.messages.find((item) => item.id === run.assistantMessageId);
    const metadata = assistantAgentMetadataSchema.safeParse(this.metadata(message?.metadata));
    const value = metadata.success ? metadata.data : undefined;
    return {
      runId: run.id,
      sessionId: run.sessionId,
      status: run.status,
      assistantMessageId: run.assistantMessageId,
      assistantContent: message?.content ?? '',
      blocks: value?.blocks ?? [],
      executions: value?.agent?.executions ?? [],
      sources: value?.agent?.sources ?? [],
      toolCallCount: run.toolCallCount,
      lastEventSequence: Number(run.lastEventSequence),
      ...(run.errorCode && run.errorDetail
        ? { error: { code: run.errorCode, detail: run.errorDetail } }
        : {}),
      createdAt: run.createdAt.toISOString(),
      ...(run.startedAt ? { startedAt: run.startedAt.toISOString() } : {}),
      ...(run.endedAt ? { endedAt: run.endedAt.toISOString() } : {}),
    };
  }

  async start(runId: string): Promise<boolean> {
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

  async heartbeat(runId: string): Promise<void> {
    await this.prisma.agentRun.updateMany({
      where: { id: runId, status: { in: [...ACTIVE_STATUSES] } },
      data: { heartbeatAt: new Date(), version: { increment: 1 } },
    });
  }

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
        input: input.toolInput === undefined ? undefined : (input.toolInput as Prisma.InputJsonValue),
      },
    });
    await this.prisma.agentRun.update({
      where: { id: input.runId },
      data: { activeStepId: input.id, version: { increment: 1 } },
    });
  }

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

  async flush(
    runId: string,
    assistantMessageId: string,
    projection: ChatProjectionSnapshot,
    lastEventSequence: number,
    draftVersion: number,
  ): Promise<void> {
    const content = projection.blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.content)
      .join('');
    await this.prisma.$transaction([
      this.prisma.message.update({
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
          } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          toolCallCount: projection.toolCallCount,
          lastEventSequence,
          heartbeatAt: new Date(),
          version: { increment: 1 },
        },
      }),
    ]);
  }

  async requestCancel(runId: string): Promise<AgentRunStatus> {
    const result = await this.prisma.agentRun.updateMany({
      where: { id: runId, status: { in: [...ACTIVE_STATUSES] } },
      data: { status: 'cancel_requested', version: { increment: 1 } },
    });
    if (result.count === 1) return 'cancel_requested';
    const run = await this.prisma.agentRun.findUnique({ where: { id: runId } });
    return run?.status ?? 'failed';
  }

  async terminal(input: {
    runId: string;
    assistantMessageId: string;
    status: 'completed' | 'failed' | 'cancelled';
    projection: ChatProjectionSnapshot;
    lastEventSequence: number;
    draftVersion: number;
    error?: { code: string; detail: string };
  }): Promise<void> {
    const content = input.projection.blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.content)
      .join('');
    await this.prisma.$transaction([
      this.prisma.message.update({
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
            agent: {
              toolCallCount: input.projection.toolCallCount,
              executions: input.projection.executions,
              sources: input.projection.sources,
            },
          } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.agentRun.update({
        where: { id: input.runId },
        data: {
          status: input.status,
          toolCallCount: input.projection.toolCallCount,
          lastEventSequence: input.lastEventSequence,
          errorCode: input.error?.code,
          errorDetail: input.error?.detail,
          activeStepId: null,
          endedAt: new Date(),
          heartbeatAt: new Date(),
          version: { increment: 1 },
        },
      }),
    ]);
  }

  private metadata(value: Prisma.JsonValue | undefined): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
