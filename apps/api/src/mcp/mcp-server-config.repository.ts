import { Inject, Injectable } from '@nestjs/common';
import type { McpDefaultApproval, McpServerConfig, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type McpServerConfigRecord = McpServerConfig & {
  secrets: Array<{ kind: string; name: string }>;
};

@Injectable()
export class McpServerConfigRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<McpServerConfigRecord[]> {
    return this.prisma.mcpServerConfig.findMany({
      where: { userId, sessionId: null },
      include: { secrets: { select: { kind: true, name: true } } },
      orderBy: { serverName: 'asc' },
    });
  }

  async listEnabled(userId: string): Promise<McpServerConfigRecord[]> {
    return this.prisma.mcpServerConfig.findMany({
      where: { userId, sessionId: null, enabled: true },
      include: { secrets: true },
      orderBy: { serverName: 'asc' },
    });
  }

  async findById(id: string, userId: string): Promise<McpServerConfigRecord | null> {
    return this.prisma.mcpServerConfig.findFirst({
      where: { id, userId },
      include: { secrets: true },
    });
  }

  async create(
    data: Omit<Prisma.McpServerConfigCreateInput, 'user' | 'sessionId'>,
    userId: string,
  ): Promise<McpServerConfig> {
    return this.prisma.mcpServerConfig.create({
      data: { ...data, user: { connect: { id: userId } }, sessionId: null },
    });
  }

  async update(id: string, data: Prisma.McpServerConfigUpdateInput, userId: string) {
    const existing = await this.findById(id, userId);
    if (!existing) return null;
    return this.prisma.mcpServerConfig.update({ where: { id }, data });
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const existing = await this.findById(id, userId);
    if (!existing) return false;
    await this.prisma.mcpServerConfig.delete({ where: { id } });
    return true;
  }
}
