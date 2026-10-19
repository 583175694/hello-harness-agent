import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import {
  assistantResearchProjectionSchema,
  type AssistantContentBlock,
  type AssistantTextBlock,
  type ResearchSourceSnapshot,
  type ToolExecutionSnapshot,
} from '@harness/agent-protocol';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RunProjectionArchiver } from '../run-storage/run-projection.archiver';
import { formatLogDuration, shortLogId } from '../shared/logging.utils';

@Injectable()
export class AssistantDeliveryRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(RunProjectionArchiver) private readonly projectionArchiver: RunProjectionArchiver,
  ) {}

  // 以事务方式保存完整 assistant 消息并更新会话排序时间。
  async save(input: {
    userId: string;
    sessionId: string;
    runId?: string;
    messageId: string;
    model: string;
    blocks: AssistantContentBlock[];
    toolCallCount: number;
    executions: ToolExecutionSnapshot[];
    sources: ResearchSourceSnapshot[];
  }): Promise<void> {
    const startedAt = Date.now();
    const content = input.blocks
      .filter((block): block is AssistantTextBlock => block.type === 'text')
      .map((block) => block.content)
      .join('');
    const detailStore = (this.prisma as unknown as {
      agentRunDetail?: PrismaService['agentRunDetail'];
    }).agentRunDetail;
    if (!detailStore) throw new Error('AGENT_RUN_DETAIL_STORE_UNAVAILABLE');
    const storageRunId = input.runId ?? input.messageId;
    const trimmed = await this.projectionArchiver.trimAndPersist({
      runId: storageRunId,
      sessionId: input.sessionId,
      projection: {
        executions: input.executions,
        sources: input.sources,
        blocks: input.blocks,
      },
    });
    const researchProjection = assistantResearchProjectionSchema.parse({
      executions: trimmed.executions,
      sources: trimmed.sources,
      blocks: trimmed.blocks,
    });
    const metadata = {
      model: input.model,
      deliveryStatus: 'completed',
      ...(input.runId ? { runId: input.runId } : {}),
      agent: { toolCallCount: input.toolCallCount, detailRef: input.runId ?? input.messageId },
    } satisfies Prisma.InputJsonValue;
    const messageCreate = this.prisma.message.create({
      data: {
        id: input.messageId,
        userId: input.userId,
        sessionId: input.sessionId,
        role: 'assistant',
        kind: 'assistant_delivery',
        content,
        ...(input.runId ? { runId: input.runId } : {}),
        metadata,
      },
    });
    const detailUpsert = detailStore.upsert({
      where: input.runId ? { runId: input.runId } : { messageId: input.messageId },
      create: {
        id: crypto.randomUUID(),
        ...(input.runId ? { runId: input.runId } : {}),
        messageId: input.messageId,
        sessionId: input.sessionId,
        schemaVersion: 1,
        researchProjection: researchProjection as Prisma.InputJsonValue,
      },
      update: {
        schemaVersion: 1,
        researchProjection: researchProjection as Prisma.InputJsonValue,
      },
    });
    await this.prisma.$transaction([
      messageCreate,
      detailUpsert,
      this.prisma.session.update({
        where: { id: input.sessionId },
        data: { updatedAt: new Date() },
      }),
    ]);
    this.logger.log(
      `回复已持久化 | 会话=${shortLogId(input.sessionId)} | 消息=${shortLogId(input.messageId)} | 输出=${content.length} 字 | 内容块=${input.blocks.length} 个 | 执行=${input.executions.length} 次 | 来源=${input.sources.length} 个 | 耗时=${formatLogDuration(Date.now() - startedAt)}`,
      AssistantDeliveryRepository.name,
    );
  }
}
