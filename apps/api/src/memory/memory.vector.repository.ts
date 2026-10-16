import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MemoryConfigService } from './memory.config';
import { cosineSimilarity, vectorLiteral } from './memory.utils';
import type { MemoryKind } from './memory.constants';

export type VectorSearchHit = {
  memoryId: string;
  title: string;
  summary: string;
  kind: MemoryKind;
  similarity: number;
  embeddingModel: string | null;
  sourceRefs: unknown;
  sensitivity: string;
  policy: unknown;
  freshness: string;
  importance: string;
  confidence: string;
};

@Injectable()
export class MemoryVectorRepository {
  private pgvectorReady: boolean | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MemoryConfigService) private readonly config: MemoryConfigService,
  ) {}

  async pgvectorStatus(): Promise<'ok' | 'fallback_jsonb'> {
    const ready = await this.ensurePgvector();
    return ready ? 'ok' : 'fallback_jsonb';
  }

  async searchTopK(userId: string, queryVector: number[], topK: number): Promise<VectorSearchHit[]> {
    const ready = await this.ensurePgvector();
    if (ready) {
      try {
        const literal = vectorLiteral(queryVector);
        const rows = await this.prisma.$queryRawUnsafe<
          Array<{
            id: string;
            title: string;
            summary: string;
            kind: string;
            similarity: number;
            embedding_model: string | null;
            source_refs: unknown;
            sensitivity: string;
            policy: unknown;
            freshness: string;
            importance: string;
            confidence: string;
          }>
        >(
          `SELECT id, title, summary, kind,
            1 - (embedding <=> $1::vector) AS similarity,
            embedding_model, source_refs, sensitivity, policy, freshness, importance, confidence
           FROM memory_records
           WHERE user_id = $2 AND status = 'active' AND embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
           LIMIT $3`,
          literal,
          userId,
          topK,
        );
        return rows.map((row) => ({
          memoryId: row.id,
          title: row.title,
          summary: row.summary,
          kind: row.kind as MemoryKind,
          similarity: Number(row.similarity),
          embeddingModel: row.embedding_model,
          sourceRefs: row.source_refs,
          sensitivity: row.sensitivity,
          policy: row.policy,
          freshness: row.freshness,
          importance: row.importance,
          confidence: row.confidence,
        }));
      } catch {
        this.pgvectorReady = false;
      }
    }
    const rows = await this.prisma.memoryRecord.findMany({
      where: { userId, status: 'active', embeddingJson: { not: Prisma.DbNull } },
      select: {
        id: true,
        title: true,
        summary: true,
        kind: true,
        embeddingJson: true,
        embeddingModel: true,
        sourceRefs: true,
        sensitivity: true,
        policy: true,
        freshness: true,
        importance: true,
        confidence: true,
      },
    });
    const hits: VectorSearchHit[] = [];
    for (const row of rows) {
      const embedding = Array.isArray(row.embeddingJson)
        ? (row.embeddingJson as number[])
        : null;
      if (!embedding?.length) continue;
      hits.push({
        memoryId: row.id,
        title: row.title,
        summary: row.summary,
        kind: row.kind as MemoryKind,
        similarity: cosineSimilarity(queryVector, embedding),
        embeddingModel: row.embeddingModel,
        sourceRefs: row.sourceRefs,
        sensitivity: row.sensitivity,
        policy: row.policy,
        freshness: row.freshness,
        importance: row.importance,
        confidence: row.confidence,
      });
    }
    hits.sort((left, right) => right.similarity - left.similarity);
    return hits.slice(0, topK);
  }

  private async ensurePgvector(): Promise<boolean> {
    if (this.pgvectorReady !== undefined) return this.pgvectorReady;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) AS exists`;
      this.pgvectorReady = Boolean(rows[0]?.exists);
    } catch {
      this.pgvectorReady = false;
    }
    return this.pgvectorReady;
  }
}
