import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MemoryRecordView } from '@harness/agent-protocol';
import { MEMORY_LIMITS, MEMORY_POLICY_VERSION, type MemoryKind } from './memory.constants';
import { MemoryConfigService } from './memory.config';
import { evaluateMemoryWriteEligibility } from './memory.eligibility';
import { MemoryEmbedJobService } from './memory.embed.job';
import { MemoryEmbeddingService } from './memory.embedding.service';
import { MemoryRepository } from './memory.repository';
import {
  findBestVectorMatch,
  findSimilarMemoryIds,
  findTitleDedupMatch,
  type MemoryDedupEntry,
} from './memory.dedup';
import { MemoryEligibilityRejectedError } from './memory.errors';
import { truncateToMaxChars } from './memory.utils';
import { describeLogError } from '../shared/logging.utils';
import type {
  MemoryProvenance,
  MemorySourceRef,
  MemoryWriteInput,
  MemoryWriteOutput,
} from './memory.types';

const EXPLICIT_REMEMBER = /请记住|记得|别忘了|以后都|长期记住/;

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @Inject(MemoryRepository) private readonly repository: MemoryRepository,
    @Inject(MemoryConfigService) private readonly config: MemoryConfigService,
    @Inject(MemoryEmbeddingService) private readonly embedding: MemoryEmbeddingService,
    @Inject(MemoryEmbedJobService) private readonly embedJob: MemoryEmbedJobService,
  ) {}

  indexingStatus(record: {
    embeddingModel?: string;
    embeddedAt?: string;
    provenance?: MemoryProvenance;
  }): 'ready' | 'pending' | 'failed' {
    if (record.provenance?.indexingFailed) return 'failed';
    if (
      record.embeddedAt &&
      record.embeddingModel &&
      record.embeddingModel === this.config.embeddingModel
    ) {
      return 'ready';
    }
    return 'pending';
  }

  toView(record: Parameters<MemoryService['indexingStatus']>[0] & {
    memoryId: string;
    kind: string;
    title: string;
    summary: string;
    status: string;
    confidence: 'low' | 'medium' | 'high';
    freshness: 'fresh' | 'stale' | 'unknown';
    importance: 'low' | 'medium' | 'high';
    createdAt: string;
    updatedAt: string;
  }): MemoryRecordView {
    return {
      memoryId: record.memoryId,
      kind: record.kind,
      title: record.title,
      summary: record.summary,
      status: record.status,
      confidence: record.confidence,
      freshness: record.freshness,
      importance: record.importance,
      indexingStatus: this.indexingStatus(record),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async listActive(userId: string): Promise<{ memories: MemoryRecordView[]; activeCount: number }> {
    const records = await this.repository.listActive(userId);
    return {
      memories: records.map((record) => this.toView({ ...record, memoryId: record.memoryId })),
      activeCount: records.length,
    };
  }

  async getSettings(userId: string) {
    return this.repository.getUserSettings(userId);
  }

  async patchSettings(userId: string, allowAgentWrite: boolean) {
    await this.repository.upsertUserSettings(userId, allowAgentWrite);
    return this.getSettings(userId);
  }

  async createFromSettings(input: {
    userId: string;
    kind: MemoryKind;
    title: string;
    content: string;
  }): Promise<MemoryRecordView> {
    const title = truncateToMaxChars(input.title, MEMORY_LIMITS.titleMaxLength);
    const summary = truncateToMaxChars(input.content, MEMORY_LIMITS.contentMaxLength);
    const eligibility = evaluateMemoryWriteEligibility({
      title,
      content: summary,
      confidence: 'high',
      activeCount: 0,
      activeCap: this.config.activeCap,
    });
    if (!eligibility.ok) throw new MemoryEligibilityRejectedError(eligibility.reason);
    const memoryId = crypto.randomUUID();
    const sourceRefs: MemorySourceRef[] = [
      {
        refType: 'session',
        refId: `settings:${input.userId}`,
        userId: input.userId,
        sessionId: `settings:${input.userId}`,
        relation: 'source',
      },
    ];
    const provenance: MemoryProvenance = {
      sourceSessionId: `settings:${input.userId}`,
      writer: 'settings',
      policyVersion: MEMORY_POLICY_VERSION,
    };
    const created = await this.repository.createIfUnderActiveCap(
      {
        memoryId,
        userId: input.userId,
        kind: input.kind,
        title,
        summary,
        confidence: 'high',
        sourceRefs,
        provenance,
      },
      this.config.activeCap,
    );
    if (created === 'limit_exceeded') {
      throw new MemoryEligibilityRejectedError('limit_exceeded');
    }
    await this.embedJob.embedRecord(memoryId, title, summary);
    return this.toView({ ...created, memoryId: created.memoryId });
  }

  async updateFromSettings(input: {
    userId: string;
    memoryId: string;
    kind: MemoryKind;
    title: string;
    content: string;
  }): Promise<MemoryRecordView> {
    const existing = await this.repository.findById(input.userId, input.memoryId);
    if (!existing || existing.status !== 'active') throw new NotFoundException();
    const title = truncateToMaxChars(input.title, MEMORY_LIMITS.titleMaxLength);
    const summary = truncateToMaxChars(input.content, MEMORY_LIMITS.contentMaxLength);
    const record = await this.repository.updateContent({
      userId: input.userId,
      memoryId: input.memoryId,
      kind: input.kind,
      title,
      summary,
      confidence: existing.confidence,
      sourceRefs: existing.sourceRefs,
      provenance: { ...existing.provenance, writer: 'settings' },
    });
    await this.embedJob.embedRecord(input.memoryId, title, summary);
    return this.toView({ ...record, memoryId: record.memoryId });
  }

  async deleteFromSettings(userId: string, memoryId: string): Promise<void> {
    const existing = await this.repository.findById(userId, memoryId);
    if (!existing) throw new NotFoundException();
    await this.repository.softDelete(userId, memoryId);
  }

  async writeFromTool(
    userId: string,
    context: {
      sessionId: string;
      runId?: string;
      messageId: string;
      toolCallId: string;
      userUtterance?: string;
    },
    input: MemoryWriteInput,
  ): Promise<MemoryWriteOutput> {
    if (!this.config.writeEnabled) {
      return { ok: false, action: input.action, status: 'rejected', reason: 'memory_write_disabled' };
    }
    const settings = await this.repository.getUserSettings(userId);
    if (!settings.allowAgentWrite) {
      return { ok: false, action: input.action, status: 'rejected', reason: 'user_write_disabled' };
    }

    if (input.action === 'delete') {
      if (!input.memoryId) {
        return { ok: false, action: 'delete', status: 'rejected', reason: 'missing_memory_id' };
      }
      const existing = await this.repository.findById(userId, input.memoryId);
      if (!existing || existing.status !== 'active') {
        return { ok: false, action: 'delete', status: 'rejected', reason: 'not_found' };
      }
      await this.repository.softDelete(userId, input.memoryId);
      this.logger.log({ event: 'memory.tool.write', action: 'delete', memoryId: input.memoryId, ok: true });
      return { ok: true, action: 'delete', memoryId: input.memoryId, status: 'expired' };
    }

    const title = truncateToMaxChars(input.title ?? '', MEMORY_LIMITS.titleMaxLength);
    const summary = truncateToMaxChars(input.content ?? '', MEMORY_LIMITS.contentMaxLength);
    if (!title || !summary) {
      return { ok: false, action: input.action, status: 'rejected', reason: 'missing_fields' };
    }

    const eligibility = evaluateMemoryWriteEligibility({
      title,
      content: summary,
      confidence: input.confidence,
      activeCount: 0,
      activeCap: this.config.activeCap,
    });
    if (!eligibility.ok) {
      this.logger.log({ event: 'memory.tool.write', action: input.action, ok: false, reason: eligibility.reason });
      return { ok: false, action: input.action, status: 'rejected', reason: eligibility.reason };
    }

    const sourceRefs: MemorySourceRef[] = [
      {
        refType: 'message',
        refId: context.messageId,
        userId,
        sessionId: context.sessionId,
        ...(context.runId ? { runId: context.runId } : {}),
        relation: 'source',
      },
    ];
    const provenance: MemoryProvenance = {
      sourceSessionId: context.sessionId,
      ...(context.runId ? { sourceRunId: context.runId } : {}),
      sourceToolCallId: context.toolCallId,
      writer: 'memory_write',
      policyVersion: MEMORY_POLICY_VERSION,
    };

    const syncEmbed =
      input.storageIntent === 'explicit' ||
      EXPLICIT_REMEMBER.test(context.userUtterance ?? '');

    if (input.action === 'update') {
      if (!input.memoryId) {
        return { ok: false, action: 'update', status: 'rejected', reason: 'missing_memory_id' };
      }
      const existing = await this.repository.findById(userId, input.memoryId);
      if (!existing) {
        return { ok: false, action: 'update', status: 'rejected', reason: 'not_found' };
      }
      const record = await this.repository.updateContent({
        userId,
        memoryId: input.memoryId,
        kind: (input.kind ?? existing.kind) as MemoryKind,
        title,
        summary,
        confidence: input.confidence ?? existing.confidence,
        sourceRefs,
        provenance,
        supersedesMemoryId: existing.memoryId,
      });
      const indexingStatus = syncEmbed
        ? await this.embedJob.embedRecord(record.memoryId, title, summary)
        : (this.embedJob.scheduleEmbed(record.memoryId, title, summary), 'pending' as const);
      this.scheduleSupersedeNearDuplicates(userId, record.memoryId, title, summary);
      this.logger.log({ event: 'memory.tool.write', action: 'update', memoryId: record.memoryId, ok: true });
      return {
        ok: true,
        action: 'update',
        memoryId: record.memoryId,
        status: 'active',
        indexingStatus,
      };
    }

    const dedup = await this.findDedupCandidate(userId, title, summary);
    if (dedup) {
      return this.writeFromTool(userId, context, {
        action: 'update',
        memoryId: dedup.memoryId,
        title,
        content: summary,
        kind: input.kind,
        storageIntent: input.storageIntent,
        confidence: input.confidence,
      });
    }

    const memoryId = crypto.randomUUID();
    const created = await this.repository.createIfUnderActiveCap(
      {
        memoryId,
        userId,
        kind: (input.kind ?? 'preference') as MemoryKind,
        title,
        summary,
        confidence: input.confidence ?? 'medium',
        sourceRefs,
        provenance,
      },
      this.config.activeCap,
    );
    if (created === 'limit_exceeded') {
      this.logger.log({ event: 'memory.tool.write', action: 'create', ok: false, reason: 'limit_exceeded' });
      return { ok: false, action: 'create', status: 'rejected', reason: 'limit_exceeded' };
    }
    const indexingStatus = syncEmbed
      ? await this.embedJob.embedRecord(memoryId, title, summary)
      : (this.embedJob.scheduleEmbed(memoryId, title, summary), 'pending' as const);
    this.scheduleSupersedeNearDuplicates(userId, memoryId, title, summary);
    this.logger.log({ event: 'memory.tool.write', action: 'create', memoryId, ok: true });
    return { ok: true, action: 'create', memoryId, status: 'active', indexingStatus };
  }

  private async listActiveDedupEntries(userId: string): Promise<MemoryDedupEntry[]> {
    const records = await this.repository.listActive(userId);
    return records.map((record) => ({
      memoryId: record.memoryId,
      title: record.title,
      summary: record.summary,
      embedding: record.embedding,
    }));
  }

  private entriesWithStoredEmbeddings(entries: MemoryDedupEntry[]): MemoryDedupEntry[] {
    return entries.filter((entry) => entry.embedding?.length);
  }

  private async findDedupCandidate(userId: string, title: string, summary: string) {
    const entries = await this.listActiveDedupEntries(userId);
    const titleMatch = findTitleDedupMatch(entries, title);
    if (titleMatch) {
      return this.repository.findById(userId, titleMatch.memoryId);
    }
    const embedded = this.entriesWithStoredEmbeddings(entries);
    if (!embedded.length) return undefined;
    try {
      const vector = await this.embedding.embedDocument(title, summary);
      const match = findBestVectorMatch(embedded, vector, this.config.dedupThreshold);
      if (match) {
        return this.repository.findById(userId, match.memoryId);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private scheduleSupersedeNearDuplicates(
    userId: string,
    keeperMemoryId: string,
    title: string,
    summary: string,
  ): void {
    void this.supersedeNearDuplicates(userId, keeperMemoryId, title, summary).catch((error) => {
      this.logger.warn(`memory supersede async failed | 原因=${describeLogError(error)}`);
    });
  }

  private async supersedeNearDuplicates(
    userId: string,
    keeperMemoryId: string,
    title: string,
    summary: string,
  ): Promise<void> {
    try {
      const vector = await this.embedding.embedDocument(title, summary);
      const entries = this.entriesWithStoredEmbeddings(await this.listActiveDedupEntries(userId));
      const victimIds = findSimilarMemoryIds(
        entries,
        vector,
        this.config.dedupThreshold,
        keeperMemoryId,
      );
      for (const memoryId of victimIds) {
        await this.repository.markSuperseded(userId, memoryId, keeperMemoryId);
        this.logger.log({
          event: 'memory.tool.write',
          action: 'supersede',
          memoryId,
          supersededBy: keeperMemoryId,
          ok: true,
        });
      }
    } catch (error) {
      this.logger.warn(`memory supersede scan failed | 原因=${describeLogError(error)}`);
    }
  }
}
