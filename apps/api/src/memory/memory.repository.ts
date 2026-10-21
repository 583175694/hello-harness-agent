import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type MemoryRecord as DbMemoryRecord } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { MemoryKind } from './memory.constants';
import type {
  MemoryProvenance,
  MemoryRecordDomain,
  MemoryRecordPolicy,
  MemorySourceRef,
  MemoryStatus,
} from './memory.types';

function parseJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function rowToDomain(row: DbMemoryRecord): MemoryRecordDomain {
  const embeddingRaw = row.embeddingJson;
  const embedding =
    Array.isArray(embeddingRaw) && embeddingRaw.every((item) => typeof item === 'number')
      ? (embeddingRaw as number[])
      : undefined;
  return {
    memoryId: row.id,
    userId: row.userId,
    kind: row.kind as MemoryKind,
    title: row.title,
    summary: row.summary,
    status: row.status as MemoryStatus,
    confidence: row.confidence as MemoryRecordDomain['confidence'],
    freshness: row.freshness as MemoryRecordDomain['freshness'],
    importance: row.importance as MemoryRecordDomain['importance'],
    sensitivity: row.sensitivity as MemoryRecordDomain['sensitivity'],
    sourceRefs: parseJsonArray<MemorySourceRef>(row.sourceRefs),
    policy: (row.policy ?? {}) as MemoryRecordPolicy,
    provenance: row.provenance as MemoryProvenance,
    ...(row.supersedesMemoryId ? { supersedesMemoryId: row.supersedesMemoryId } : {}),
    ...(row.embeddingModel ? { embeddingModel: row.embeddingModel } : {}),
    ...(row.embeddedAt ? { embeddedAt: row.embeddedAt.toISOString() } : {}),
    ...(embedding ? { embedding } : {}),
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
    useCount: row.useCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class MemoryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async countActive(userId: string): Promise<number> {
    return this.prisma.memoryRecord.count({ where: { userId, status: 'active' } });
  }

  async findById(userId: string, memoryId: string): Promise<MemoryRecordDomain | null> {
    const row = await this.prisma.memoryRecord.findFirst({ where: { id: memoryId, userId } });
    return row ? rowToDomain(row) : null;
  }

  async listActive(userId: string): Promise<MemoryRecordDomain[]> {
    const rows = await this.prisma.memoryRecord.findMany({
      where: { userId, status: 'active' },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return rows.map(rowToDomain);
  }

  async listActiveWithEmbeddings(userId: string): Promise<MemoryRecordDomain[]> {
    const rows = await this.prisma.memoryRecord.findMany({
      where: {
        userId,
        status: 'active',
        embeddingJson: { not: Prisma.DbNull },
      },
    });
    return rows.map(rowToDomain);
  }

  async create(input: {
    memoryId: string;
    userId: string;
    kind: MemoryKind;
    title: string;
    summary: string;
    confidence: MemoryRecordDomain['confidence'];
    sourceRefs: MemorySourceRef[];
    provenance: MemoryProvenance;
    policy?: MemoryRecordPolicy;
  }): Promise<MemoryRecordDomain> {
    const row = await this.prisma.memoryRecord.create({
      data: {
        id: input.memoryId,
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        summary: input.summary,
        status: 'active',
        confidence: input.confidence,
        sourceRefs: input.sourceRefs as unknown as Prisma.InputJsonValue,
        provenance: input.provenance as unknown as Prisma.InputJsonValue,
        policy: (input.policy ?? { allowAutoInject: true, allowUseInWorker: false }) as Prisma.InputJsonValue,
      },
    });
    return rowToDomain(row);
  }

  /** 在事务内校验 active 上限后创建，避免并发超 cap。 */
  async createIfUnderActiveCap(
    input: Parameters<MemoryRepository['create']>[0],
    activeCap: number,
  ): Promise<MemoryRecordDomain | 'limit_exceeded'> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.memoryRecord.count({
        where: { userId: input.userId, status: 'active' },
      });
      if (count >= activeCap) return 'limit_exceeded';
      const row = await tx.memoryRecord.create({
        data: {
          id: input.memoryId,
          userId: input.userId,
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          status: 'active',
          confidence: input.confidence,
          sourceRefs: input.sourceRefs as unknown as Prisma.InputJsonValue,
          provenance: input.provenance as unknown as Prisma.InputJsonValue,
          policy: (input.policy ?? { allowAutoInject: true, allowUseInWorker: false }) as Prisma.InputJsonValue,
        },
      });
      return rowToDomain(row);
    });
  }

  async updateContent(input: {
    userId: string;
    memoryId: string;
    kind: MemoryKind;
    title: string;
    summary: string;
    confidence: MemoryRecordDomain['confidence'];
    sourceRefs: MemorySourceRef[];
    provenance: MemoryProvenance;
    supersedesMemoryId?: string;
  }): Promise<MemoryRecordDomain> {
    const owned = await this.prisma.memoryRecord.findFirst({
      where: { id: input.memoryId, userId: input.userId },
      select: { id: true },
    });
    if (!owned) throw new Error('MEMORY_OWNERSHIP');
    const row = await this.prisma.memoryRecord.update({
      where: { id: input.memoryId },
      data: {
        kind: input.kind,
        title: input.title,
        summary: input.summary,
        confidence: input.confidence,
        sourceRefs: input.sourceRefs as unknown as Prisma.InputJsonValue,
        provenance: input.provenance as unknown as Prisma.InputJsonValue,
        status: 'active',
        ...(input.supersedesMemoryId ? { supersedesMemoryId: input.supersedesMemoryId } : {}),
        embeddingModel: null,
        embeddedAt: null,
        embeddingJson: Prisma.DbNull,
      },
    });
    await this.clearPgvectorEmbedding(input.memoryId);
    return rowToDomain(row);
  }

  async markSuperseded(userId: string, memoryId: string, supersededBy: string): Promise<void> {
    await this.prisma.memoryRecord.updateMany({
      where: { id: memoryId, userId },
      data: { status: 'superseded', supersedesMemoryId: supersededBy },
    });
  }

  async softDelete(userId: string, memoryId: string): Promise<void> {
    const result = await this.prisma.memoryRecord.updateMany({
      where: { id: memoryId, userId },
      data: {
        status: 'expired',
        expiresAt: new Date(),
        embeddingModel: null,
        embeddedAt: null,
        embeddingJson: Prisma.DbNull,
      },
    });
    if (result.count === 0) throw new Error('MEMORY_NOT_FOUND');
    await this.clearPgvectorEmbedding(memoryId);
  }

  async saveEmbedding(
    memoryId: string,
    embedding: number[],
    embeddingModel: string,
    failed?: boolean,
  ): Promise<void> {
    const record = await this.prisma.memoryRecord.findUnique({ where: { id: memoryId } });
    if (!record) return;
    const provenance = (record.provenance ?? {}) as MemoryProvenance;
    if (failed) {
      await this.prisma.memoryRecord.update({
        where: { id: memoryId },
        data: {
          provenance: { ...provenance, indexingFailed: true } as unknown as Prisma.InputJsonValue,
          embeddingModel: null,
          embeddedAt: null,
          embeddingJson: Prisma.DbNull,
        },
      });
      await this.clearPgvectorEmbedding(memoryId);
      return;
    }
    await this.prisma.memoryRecord.update({
      where: { id: memoryId },
      data: {
        embeddingJson: embedding as unknown as Prisma.InputJsonValue,
        embeddingModel,
        embeddedAt: new Date(),
        provenance: { ...provenance, indexingFailed: false } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE memory_records SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(',')}]`,
      memoryId,
    ).catch(() => undefined);
  }

  async listPendingEmbed(userId?: string): Promise<MemoryRecordDomain[]> {
    const rows = await this.prisma.memoryRecord.findMany({
      where: {
        status: 'active',
        embeddedAt: null,
        ...(userId ? { userId } : {}),
      },
      take: 200,
    });
    return rows.map(rowToDomain);
  }

  async touchUsage(memoryIds: string[]): Promise<void> {
    if (!memoryIds.length) return;
    await this.prisma.memoryRecord.updateMany({
      where: { id: { in: memoryIds }, status: 'active' },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    });
  }

  async getUserSettings(userId: string): Promise<{ allowAgentWrite: boolean }> {
    const row = await this.prisma.userMemorySettings.findUnique({ where: { userId } });
    return { allowAgentWrite: row?.allowAgentWrite ?? true };
  }

  async upsertUserSettings(userId: string, allowAgentWrite: boolean): Promise<void> {
    await this.prisma.userMemorySettings.upsert({
      where: { userId },
      create: { userId, allowAgentWrite },
      update: { allowAgentWrite },
    });
  }

  /** pgvector 列不在 Prisma schema 中，内容变更或索引失败时需显式清空。 */
  private async clearPgvectorEmbedding(memoryId: string): Promise<void> {
    await this.prisma
      .$executeRawUnsafe(`UPDATE memory_records SET embedding = NULL WHERE id = $1`, memoryId)
      .catch(() => undefined);
  }
}
