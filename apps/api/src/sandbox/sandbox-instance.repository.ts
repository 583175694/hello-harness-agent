import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type SandboxInstanceRecord = {
  sessionId: string;
  providerSandboxId: string;
  status: 'active' | 'stale' | 'destroying';
  lastActiveAt: Date;
  expiresAt: Date;
  hardExpiresAt: Date;
};

@Injectable()
export class SandboxInstanceRepository {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  enabled(): boolean {
    return Boolean(this.prisma);
  }

  async findBySessionId(sessionId: string): Promise<SandboxInstanceRecord | undefined> {
    if (!this.prisma) return undefined;
    const row = await this.prisma.sandboxInstance.findUnique({
      where: { sessionId },
    });
    if (!row || row.status === 'stale') return undefined;
    return row;
  }

  async upsertActive(input: {
    sessionId: string;
    providerSandboxId: string;
    lastActiveAt: Date;
    expiresAt: Date;
    hardExpiresAt: Date;
  }): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.sandboxInstance.upsert({
      where: { sessionId: input.sessionId },
      create: {
        sessionId: input.sessionId,
        providerSandboxId: input.providerSandboxId,
        status: 'active',
        lastActiveAt: input.lastActiveAt,
        expiresAt: input.expiresAt,
        hardExpiresAt: input.hardExpiresAt,
      },
      update: {
        providerSandboxId: input.providerSandboxId,
        status: 'active',
        lastActiveAt: input.lastActiveAt,
        expiresAt: input.expiresAt,
        hardExpiresAt: input.hardExpiresAt,
      },
    });
  }

  async touchActivity(input: {
    sessionId: string;
    lastActiveAt: Date;
    expiresAt: Date;
  }): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.sandboxInstance.updateMany({
      where: { sessionId: input.sessionId, status: 'active' },
      data: {
        lastActiveAt: input.lastActiveAt,
        expiresAt: input.expiresAt,
      },
    });
  }

  async markStale(sessionId: string): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.sandboxInstance.updateMany({
      where: { sessionId },
      data: { status: 'stale' },
    });
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.sandboxInstance.deleteMany({ where: { sessionId } });
  }

  async listActive(): Promise<SandboxInstanceRecord[]> {
    if (!this.prisma) return [];
    const rows = await this.prisma.sandboxInstance.findMany({
      where: { status: 'active' },
    });
    return rows;
  }
}
