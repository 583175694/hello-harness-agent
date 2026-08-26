import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';

const MAX_PENDING = 3;

@Injectable()
export class PendingUserInputService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(sessionId: string) {
    return this.prisma.pendingUserInput.findMany({
      where: { sessionId },
      orderBy: { sequence: 'asc' },
    });
  }

  async findById(id: string) {
    return this.prisma.pendingUserInput.findUnique({ where: { id } });
  }

  async activeRunId(sessionId: string): Promise<string | undefined> {
    const run = await this.prisma.agentRun.findFirst({
      where: { sessionId, status: { in: ['queued', 'running', 'cancel_requested'] } },
      select: { id: true },
    });
    return run?.id;
  }

  async submit(sessionId: string, content: string, idempotencyKey: string) {
    const hash = createHash('sha256').update(content).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { id: sessionId, userId: LOCAL_USER_ID },
      });
      if (!session) throw new NotFoundException('会话不存在。');
      const active = await tx.agentRun.findFirst({
        where: { sessionId, status: { in: ['queued', 'running', 'cancel_requested'] } },
      });
      if (!active) return { kind: 'run' as const };
      const existing = await tx.pendingUserInput.findUnique({
        where: { sessionId_idempotencyKey: { sessionId, idempotencyKey } },
      });
      if (existing) {
        if (existing.content !== content)
          throw new ConflictException('相同幂等键已用于不同的请求内容。');
        return { kind: 'pending' as const, input: existing };
      }
      const count = await tx.pendingUserInput.count({ where: { sessionId, status: 'pending' } });
      if (count >= MAX_PENDING) throw new ConflictException('待处理输入已达到上限。');
      const last = await tx.pendingUserInput.findFirst({
        where: { sessionId },
        orderBy: { sequence: 'desc' },
      });
      const input = await tx.pendingUserInput.create({
        data: {
          id: crypto.randomUUID(),
          sessionId,
          kind: 'follow_up',
          content,
          sequence: (last?.sequence ?? 0) + 1,
          idempotencyKey,
          status: 'pending',
        },
      });
      void hash;
      return { kind: 'pending' as const, input };
    });
  }

  async promote(id: string) {
    const result = await this.prisma.pendingUserInput.updateMany({
      where: { id, kind: 'follow_up', status: 'pending' },
      data: { kind: 'steer' },
    });
    if (!result.count) throw new ConflictException('该输入已被消费或不可升级。');
    return this.prisma.pendingUserInput.findUniqueOrThrow({ where: { id } });
  }

  async cancel(id: string) {
    const result = await this.prisma.pendingUserInput.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (!result.count) throw new ConflictException('该输入已不是待处理状态。');
    return this.prisma.pendingUserInput.findUniqueOrThrow({ where: { id } });
  }

  async demote(id: string) {
    const result = await this.prisma.pendingUserInput.updateMany({
      where: { id, kind: 'steer', status: 'pending' },
      data: { kind: 'follow_up' },
    });
    if (!result.count) throw new ConflictException('该输入不可降级。');
    return this.prisma.pendingUserInput.findUniqueOrThrow({ where: { id } });
  }

  // Final-answer boundary can no longer inject the steer into the current Run.
  async demotePendingSteers(sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.pendingUserInput.findMany({
        where: { sessionId, kind: 'steer', status: 'pending' },
        orderBy: { sequence: 'asc' },
      });
      if (!rows.length) return [];
      const result = await tx.pendingUserInput.updateMany({
        where: {
          id: { in: rows.map((row) => row.id) },
          kind: 'steer',
          status: 'pending',
        },
        data: { kind: 'follow_up' },
      });
      return result.count === rows.length ? rows : [];
    });
  }

  async claimSteers(sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.pendingUserInput.findMany({
        where: { sessionId, kind: 'steer', status: 'pending' },
        orderBy: { sequence: 'asc' },
      });
      if (!rows.length) return [];
      const result = await tx.pendingUserInput.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, status: 'pending', kind: 'steer' },
        data: { status: 'consumed' },
      });
      return result.count === rows.length ? rows : [];
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

  async claimFollowUpById(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.pendingUserInput.findFirst({
        where: { id, kind: 'follow_up', status: 'pending' },
      });
      if (!row) return undefined;
      const result = await tx.pendingUserInput.updateMany({
        where: { id, kind: 'follow_up', status: 'pending' },
        data: { status: 'consumed' },
      });
      return result.count ? row : undefined;
    });
  }
}
