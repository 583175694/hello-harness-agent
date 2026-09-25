import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import {
  assistantAgentMetadataSchema,
  type AssistantContentBlock,
  type AssistantTextBlock,
  type ResearchSourceSnapshot,
  type ToolExecutionSnapshot,
} from '@harness/agent-protocol';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { formatLogDuration, shortLogId } from '../shared/logging.utils';

@Injectable()
export class AssistantDeliveryRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  // 以事务方式保存完整 assistant 消息并更新会话排序时间。
  async save(input: {
    userId: string;
    sessionId: string;
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
    const metadata = assistantAgentMetadataSchema.parse({
      model: input.model,
      blocks: input.blocks,
      ...(input.executions.length
        ? {
            agent: {
              toolCallCount: input.toolCallCount,
              executions: input.executions,
              sources: input.sources,
            },
          }
        : {}),
    });
    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          id: input.messageId,
          userId: input.userId,
          sessionId: input.sessionId,
          role: 'assistant',
          kind: 'assistant_delivery',
          content,
          metadata: metadata as Prisma.InputJsonValue,
        },
      }),
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
