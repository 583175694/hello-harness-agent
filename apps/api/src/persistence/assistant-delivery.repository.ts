import { Injectable } from '@nestjs/common';

import type { SearchSourceSnapshot, ToolExecutionSnapshot } from '@harness/agent-protocol';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AssistantDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  // 以事务方式保存完整 assistant 消息并更新会话排序时间。
  async save(input: {
    sessionId: string;
    messageId: string;
    model: string;
    content: string;
    toolCallCount: number;
    executions: ToolExecutionSnapshot[];
    sources: SearchSourceSnapshot[];
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          id: input.messageId, userId: LOCAL_USER_ID, sessionId: input.sessionId,
          role: 'assistant', kind: 'assistant_delivery', content: input.content,
          metadata: {
            model: input.model,
            ...(input.executions.length ? { agent: { toolCallCount: input.toolCallCount, executions: input.executions, sources: input.sources } } : {}),
          },
        },
      }),
      this.prisma.session.update({ where: { id: input.sessionId }, data: { updatedAt: new Date() } }),
    ]);
  }
}
