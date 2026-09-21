/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { ArtifactRef, ArtifactSeriesRef, CreateFileInput, CreateFileResult, CreateReportInput, CreateReportResult, ReportRef, RestoreArtifactResult } from '@harness/agent-protocol';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { PrismaService } from '../database/prisma.service';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { FileStorage } from '../file-storage/file-storage';
import { FilesService } from '../files/files.service';
import { describeLogError } from '../shared/logging.utils';

@Injectable()
export class ArtifactsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  async importFromSandbox(input: {
    sessionId: string;
    runId: string;
    toolCallId: string;
    fileName: string;
    data: Uint8Array;
  }) {
    const existing = await this.prisma.artifact.findFirst({
      where: {
        runId: input.runId,
        toolCallId: input.toolCallId,
        sessionId: input.sessionId,
        userId: LOCAL_USER_ID,
      },
      include: { file: true, series: true },
    });
    if (existing) {
      if (existing.status !== 'ready' || existing.file.status !== 'ready')
        throw new BadRequestException({
          code: existing.errorCode ?? AGENT_ERROR_CODES.sandboxCollectFailed,
          detail: '该生成调用未成功完成，不会重复导入文件。',
        });
      return {
        artifact: this.toRef(existing),
        file: this.files.toPublicRef(existing.file, false, { artifactId: existing.id }),
      };
    }
    const file = await this.files.importGeneratedBytes({
      sessionId: input.sessionId,
      fileName: input.fileName,
      data: input.data,
    });
    const artifactId = crypto.randomUUID();
    const seriesId = crypto.randomUUID();
    const artifact = await this.prisma.$transaction(async (tx) => {
      await tx.artifactSeries.create({
        data: {
          id: seriesId,
          userId: LOCAL_USER_ID,
          sessionId: input.sessionId,
          logicalName: input.fileName,
        },
      });
      await tx.artifact.create({
        data: {
          id: artifactId,
          fileId: file.fileId,
          userId: LOCAL_USER_ID,
          sessionId: input.sessionId,
          runId: input.runId,
          toolCallId: input.toolCallId,
          seriesId,
          versionNumber: 1,
          operation: 'create',
          status: 'ready',
        },
      });
      await tx.artifactSeries.update({
        where: { id: seriesId },
        data: { currentArtifactId: artifactId },
      });
      return tx.artifact.findUniqueOrThrow({
        where: { id: artifactId },
        include: { file: true, series: true },
      });
    });
    return {
      artifact: this.toRef(artifact),
      file: this.files.toPublicRef(artifact.file, false, { artifactId: artifact.id }),
    };
  }

  async create(input: CreateFileInput & {
    sessionId: string;
    runId: string;
    toolCallId: string;
    signal?: AbortSignal;
  }): Promise<CreateFileResult> {
    const existingReplay = await this.prisma.artifact.findFirst({
      where: {
        runId: input.runId,
        toolCallId: input.toolCallId,
        sessionId: input.sessionId,
        userId: LOCAL_USER_ID,
      },
      include: { file: true, series: true },
    });
    if (existingReplay) {
      if (existingReplay.status === 'deleted') throw this.deleted();
      if (existingReplay.status !== 'ready' || existingReplay.file.status !== 'ready')
        throw new BadRequestException({
          code: existingReplay.errorCode ?? AGENT_ERROR_CODES.artifactStorageFailed,
          detail: '该生成调用未成功完成，不会重复创建文件。',
        });
      return {
        artifact: this.toRef(existingReplay),
        file: this.files.toPublicRef(existingReplay.file, false, { artifactId: existingReplay.id }),
      };
    }
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: input.runId,
        sessionId: input.sessionId,
        session: { userId: LOCAL_USER_ID },
      },
      select: { id: true, metadata: true },
    });
    if (!run)
      throw new NotFoundException({
        code: AGENT_ERROR_CODES.runNotFound,
        detail: '运行不存在或不属于当前会话。',
      });

    const versionContext = this.versionContext(run.metadata);
    const file = await this.files.createGenerated({
      sessionId: input.sessionId,
      fileName: input.fileName,
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.sheets !== undefined ? { sheets: input.sheets } : {}),
      signal: input.signal,
    });
    try {
      if (input.signal?.aborted)
        throw new DOMException('The operation was aborted.', 'AbortError');
      const artifact = await this.prisma.$transaction(async (tx) => {
        const artifactId = crypto.randomUUID();
        if (!versionContext) {
          const seriesId = crypto.randomUUID();
          await tx.artifactSeries.create({
            data: {
              id: seriesId,
              userId: LOCAL_USER_ID,
              sessionId: input.sessionId,
              logicalName: input.fileName,
            },
          });
          await tx.artifact.create({
            data: {
              id: artifactId,
              fileId: file.fileId,
              userId: LOCAL_USER_ID,
              sessionId: input.sessionId,
              runId: input.runId,
              toolCallId: input.toolCallId,
              seriesId,
              versionNumber: 1,
              operation: 'create',
              status: 'ready',
            },
          });
          await tx.artifactSeries.update({
            where: { id: seriesId },
            data: { currentArtifactId: artifactId },
          });
        } else {
          const series = await tx.artifactSeries.findFirst({
            where: {
              id: versionContext.seriesId,
              sessionId: input.sessionId,
              userId: LOCAL_USER_ID,
            },
          });
          const base = await tx.artifact.findFirst({
            where: {
              id: versionContext.baseArtifactId,
              seriesId: versionContext.seriesId,
              sessionId: input.sessionId,
              userId: LOCAL_USER_ID,
              status: 'ready',
            },
          });
          if (!series || !base || series.currentArtifactId !== versionContext.expectedCurrentArtifactId)
            throw this.versionConflict();
          const latest = await tx.artifact.findFirst({
            where: { seriesId: series.id },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });
          await tx.artifact.create({
            data: {
              id: artifactId,
              fileId: file.fileId,
              userId: LOCAL_USER_ID,
              sessionId: input.sessionId,
              runId: input.runId,
              toolCallId: input.toolCallId,
              seriesId: series.id,
              versionNumber: (latest?.versionNumber ?? 0) + 1,
              parentArtifactId: series.currentArtifactId,
              operation: 'revise',
              changeSummary: versionContext.changeSummary,
              status: 'ready',
            },
          });
          const advanced = await tx.artifactSeries.updateMany({
            where: {
              id: series.id,
              currentArtifactId: versionContext.expectedCurrentArtifactId,
            },
            data: { currentArtifactId: artifactId },
          });
          if (advanced.count !== 1) throw this.versionConflict();
        }
        return tx.artifact.findUniqueOrThrow({
          where: { id: artifactId },
          include: { file: true, series: true },
        });
      });
      return {
        artifact: this.toRef(artifact),
        file: this.files.toPublicRef(artifact.file, false, { artifactId: artifact.id }),
      };
    } catch (error) {
      try {
        await this.files.deleteGeneratedFile(file.fileId);
      } catch {
        // The cleanup task is handled by FilesService when the object delete fails.
      }
      if (this.isUniqueConflict(error)) {
        const replay = await this.prisma.artifact.findFirst({
          where: { runId: input.runId, toolCallId: input.toolCallId, userId: LOCAL_USER_ID },
          include: { file: true, series: true },
        });
        if (replay)
          return {
            artifact: this.toRef(replay),
            file: this.files.toPublicRef(replay.file, false, { artifactId: replay.id }),
          };
        if (versionContext) throw this.versionConflict();
      }
      throw error;
    }
  }

  async createReport(input: CreateReportInput & { sessionId: string; runId: string; toolCallId: string }): Promise<CreateReportResult> {
    const run = await this.prisma.agentRun.findFirst({ where: { id: input.runId, sessionId: input.sessionId, session: { userId: LOCAL_USER_ID } }, select: { id: true } });
    if (!run) throw new NotFoundException({ code: AGENT_ERROR_CODES.runNotFound, detail: '运行不存在或不属于当前会话。' });
    const existingReport = await this.prisma.report.findFirst({ where: { runId: input.runId, sessionId: input.sessionId, userId: LOCAL_USER_ID, artifact: { toolCallId: input.toolCallId } }, include: { artifact: { include: { file: true, series: true } } } });
    if (existingReport) {
      if (existingReport.status === 'deleted') throw new BadRequestException({ code: AGENT_ERROR_CODES.reportDeleted, detail: '报告已删除。' });
      return { report: this.reportRef(existingReport), artifact: this.toRef(existingReport.artifact), file: this.files.toPublicRef(existingReport.artifact.file, false, { artifactId: existingReport.artifact.id }) };
    }
    const fileIds = [...new Set(input.fileIds ?? [])];
    if (fileIds.length) {
      const count = await this.prisma.file.count({ where: { id: { in: fileIds }, sessionId: input.sessionId, userId: LOCAL_USER_ID, status: 'ready' } });
      if (count !== fileIds.length) throw new BadRequestException({ code: AGENT_ERROR_CODES.reportValidationFailed, detail: '报告引用了不存在、未就绪或越权的材料文件。' });
    }
    const sourceIds = [...new Set(input.sourceIds ?? [])];
    const created = await this.create({ sessionId: input.sessionId, runId: input.runId, toolCallId: input.toolCallId, fileName: input.fileName, content: input.content });
    try {
      const report = await this.prisma.report.create({ data: { id: crypto.randomUUID(), artifactId: created.artifact.artifactId, runId: input.runId, userId: LOCAL_USER_ID, sessionId: input.sessionId, title: input.title, summary: input.summary, sourceIds, fileIds, status: 'ready' }, include: { artifact: { include: { file: true, series: true } } } });
      return { report: this.reportRef(report), artifact: created.artifact, file: created.file };
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const replay = await this.prisma.report.findUnique({ where: { artifactId: created.artifact.artifactId }, include: { artifact: { include: { file: true, series: true } } } });
        if (replay) return { report: this.reportRef(replay), artifact: this.toRef(replay.artifact), file: this.files.toPublicRef(replay.artifact.file, false, { artifactId: replay.artifact.id }) };
      }
      throw error;
    }
  }

  async getReport(reportId: string) {
    const report = await this.prisma.report.findFirst({ where: { id: reportId, userId: LOCAL_USER_ID }, include: { artifact: { include: { file: true, series: true } } } });
    if (!report) throw new NotFoundException({ code: AGENT_ERROR_CODES.reportNotFound, detail: '报告不存在。' });
    if (report.status === 'deleted') throw new BadRequestException({ code: AGENT_ERROR_CODES.reportDeleted, detail: '报告已删除。' });
    return { report: this.reportRef(report), artifact: this.toRef(report.artifact), file: this.files.toPublicRef(report.artifact.file, false, { artifactId: report.artifact.id }) };
  }

  async deleteReport(reportId: string) {
    const report = await this.prisma.report.findFirst({ where: { id: reportId, userId: LOCAL_USER_ID } });
    if (!report) throw new NotFoundException({ code: AGENT_ERROR_CODES.reportNotFound, detail: '报告不存在。' });
    if (report.status === 'deleted') throw new BadRequestException({ code: AGENT_ERROR_CODES.reportDeleted, detail: '报告已删除。' });
    await this.delete(report.artifactId);
    await this.prisma.report.update({ where: { id: report.id }, data: { status: 'deleted' } });
    return { deletedReportId: report.id, deletedArtifactId: report.artifactId };
  }

  async get(artifactId: string) {
    const artifact = await this.findOwned(artifactId);
    if (artifact.status === 'deleted') throw this.deleted();
    return this.toRef(artifact);
  }

  async getSeries(seriesId: string): Promise<ArtifactSeriesRef> {
    const series = await this.prisma.artifactSeries.findFirst({
      where: { id: seriesId, userId: LOCAL_USER_ID },
      include: {
        artifacts: {
          where: { status: 'ready' },
          orderBy: { versionNumber: 'asc' },
          include: { file: true, series: true },
        },
      },
    });
    if (!series)
      throw new NotFoundException({ code: AGENT_ERROR_CODES.artifactNotFound, detail: '产物系列不存在。' });
    return this.seriesRef(series);
  }

  async restore(sourceArtifactId: string, expectedCurrentArtifactId: string, idempotencyKey: string): Promise<RestoreArtifactResult> {
    const source = await this.findOwned(sourceArtifactId);
    if (source.status !== 'ready') throw this.deleted();
    const restoreKey = `artifact-restore:${idempotencyKey}`;
    const replay = await this.prisma.agentRun.findFirst({
      where: { sessionId: source.sessionId, idempotencyKey: restoreKey },
      include: { artifacts: { include: { file: true, series: true } } },
    });
    if (replay) {
      const artifact = replay.artifacts[0];
      if (!artifact || artifact.sourceArtifactId !== sourceArtifactId || artifact.seriesId !== source.seriesId)
        throw new ConflictException({ code: AGENT_ERROR_CODES.idempotencyConflict, detail: '相同幂等键已用于不同的恢复请求。' });
      return { artifact: this.toRef(artifact), file: this.files.toPublicRef(artifact.file, false, { artifactId: artifact.id }), series: await this.getSeries(artifact.seriesId) };
    }
    if (source.series.currentArtifactId !== expectedCurrentArtifactId)
      throw new ConflictException({ code: AGENT_ERROR_CODES.artifactRestoreConflict, detail: '当前版本已变化，请确认最新版本后重试恢复。' });
    const cloned = await this.files.cloneGeneratedFile(source.fileId);
    try {
      const artifact = await this.prisma.$transaction(async (tx) => {
        const currentSeries = await tx.artifactSeries.findFirst({ where: { id: source.seriesId, userId: LOCAL_USER_ID } });
        if (!currentSeries || currentSeries.currentArtifactId !== expectedCurrentArtifactId)
          throw new ConflictException({ code: AGENT_ERROR_CODES.artifactRestoreConflict, detail: '当前版本已变化，请确认最新版本后重试恢复。' });
        const current = await tx.artifact.findUnique({ where: { id: expectedCurrentArtifactId } });
        if (!current || current.seriesId !== source.seriesId || current.status !== 'ready') throw this.versionConflict();
        const latest = await tx.artifact.findFirst({ where: { seriesId: source.seriesId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
        const sourceRun = await tx.agentRun.findUniqueOrThrow({ where: { id: source.runId } });
        const runId = crypto.randomUUID();
        const userMessageId = crypto.randomUUID();
        const assistantMessageId = crypto.randomUUID();
        const artifactId = crypto.randomUUID();
        const now = new Date();
        await tx.agentRun.create({
          data: {
            id: runId,
            sessionId: source.sessionId,
            inputMessageId: userMessageId,
            assistantMessageId,
            status: 'completed',
            idempotencyKey: restoreKey,
            payloadHash: createHash('sha256').update(`${sourceArtifactId}:${expectedCurrentArtifactId}`).digest('hex'),
            provider: sourceRun.provider,
            model: sourceRun.model,
            reasoningEffort: sourceRun.reasoningEffort,
            reasoningFormat: sourceRun.reasoningFormat,
            startedAt: now,
            endedAt: now,
            metadata: { artifactRestore: { sourceArtifactId, expectedCurrentArtifactId } },
          },
        });
        await tx.message.createMany({ data: [
          { id: userMessageId, userId: LOCAL_USER_ID, sessionId: source.sessionId, runId, role: 'user', kind: 'user_message', content: `恢复 ${source.series.logicalName} v${source.versionNumber}` },
          { id: assistantMessageId, userId: LOCAL_USER_ID, sessionId: source.sessionId, runId, role: 'assistant', kind: 'assistant_delivery', content: `已恢复为新版本 v${(latest?.versionNumber ?? 0) + 1}`, metadata: { deliveryStatus: 'completed', runId, blocks: [] } },
        ] });
        await tx.artifact.create({ data: {
          id: artifactId, fileId: cloned.fileId, userId: LOCAL_USER_ID, sessionId: source.sessionId,
          runId, toolCallId: `restore:${idempotencyKey}`, seriesId: source.seriesId,
          versionNumber: (latest?.versionNumber ?? 0) + 1, parentArtifactId: expectedCurrentArtifactId,
          sourceArtifactId, operation: 'restore', changeSummary: `恢复自 v${source.versionNumber}`, status: 'ready',
        } });
        const advanced = await tx.artifactSeries.updateMany({ where: { id: source.seriesId, currentArtifactId: expectedCurrentArtifactId }, data: { currentArtifactId: artifactId } });
        if (advanced.count !== 1) throw new ConflictException({ code: AGENT_ERROR_CODES.artifactRestoreConflict, detail: '当前版本已变化，请确认最新版本后重试恢复。' });
        const created = await tx.artifact.findUniqueOrThrow({ where: { id: artifactId }, include: { file: true, series: true } });
        await tx.message.update({ where: { id: assistantMessageId }, data: { metadata: { deliveryStatus: 'completed', runId, blocks: [{ type: 'artifact', ...this.toRef(created) }] } as Prisma.InputJsonValue } });
        await tx.session.update({ where: { id: source.sessionId }, data: { updatedAt: now } });
        return created;
      });
      return { artifact: this.toRef(artifact), file: this.files.toPublicRef(artifact.file, false, { artifactId: artifact.id }), series: await this.getSeries(artifact.seriesId) };
    } catch (error) {
      await this.files.deleteGeneratedFile(cloned.fileId).catch(() => undefined);
      if (this.isUniqueConflict(error)) {
        const existing = await this.prisma.agentRun.findFirst({ where: { sessionId: source.sessionId, idempotencyKey: restoreKey }, include: { artifacts: { include: { file: true, series: true } } } });
        const artifact = existing?.artifacts[0];
        if (artifact) return { artifact: this.toRef(artifact), file: this.files.toPublicRef(artifact.file, false, { artifactId: artifact.id }), series: await this.getSeries(artifact.seriesId) };
      }
      throw error;
    }
  }

  async preview(artifactId: string) {
    const artifact = await this.findOwned(artifactId);
    if (artifact.status === 'deleted') throw this.deleted();
    if (artifact.status !== 'ready') throw new BadRequestException({ code: AGENT_ERROR_CODES.fileNotReady, detail: '产物尚未准备好。' });
    const result = await this.files.preview(artifact.fileId);
    if ('content' in result)
      return {
        content: result.content,
        contentType:
          artifact.file.fileKind === 'json'
            ? 'application/json; charset=utf-8'
            : 'text/markdown; charset=utf-8',
      };
    return { url: result.url, contentType: artifact.file.mediaType };
  }

  async download(artifactId: string) {
    const artifact = await this.findOwned(artifactId);
    if (artifact.status === 'deleted') throw this.deleted();
    if (artifact.status !== 'ready' || !artifact.file.originalKey)
      throw new BadRequestException({ code: AGENT_ERROR_CODES.fileNotReady, detail: '产物尚未准备好。' });
    const object = await this.storage.readObject({ sessionId: artifact.sessionId, fileId: artifact.fileId, variant: 'original' });
    return { content: object.content, fileName: artifact.file.fileName, mediaType: artifact.file.mediaType };
  }

  async delete(artifactId: string): Promise<{ deletedArtifactId: string; deletedFileId: string }> {
    const artifact = await this.findOwned(artifactId);
    if (artifact.status === 'deleted') throw this.deleted();
    if (artifact.file.origin !== 'agent_generated')
      throw new ConflictException({
        code: AGENT_ERROR_CODES.artifactDeleteConflict,
        detail: '只能通过产物入口删除 Agent 生成文件。',
      });
    const versionCount = await this.prisma.artifact.count({ where: { seriesId: artifact.seriesId, status: 'ready' } });
    if (versionCount > 1)
      throw new ConflictException({ code: AGENT_ERROR_CODES.artifactDeleteConflict, detail: '版本历史中的单个版本不能删除。' });
    try {
      await this.storage.deleteFile({ sessionId: artifact.sessionId, fileId: artifact.fileId });
    } catch (error) {
      await this.prisma.fileCleanupTask.upsert({
        where: { sessionId_fileId: { sessionId: artifact.sessionId, fileId: artifact.fileId } },
        create: { id: crypto.randomUUID(), sessionId: artifact.sessionId, fileId: artifact.fileId, status: 'failed', attempts: 1, lastError: describeLogError(error).slice(0, 500) },
        update: { status: 'failed', attempts: { increment: 1 }, lastError: describeLogError(error).slice(0, 500) },
      });
      throw new BadRequestException({ code: AGENT_ERROR_CODES.artifactStorageFailed, detail: '产物删除失败，系统将自动重试清理。' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.artifactSeries.updateMany({ where: { id: artifact.seriesId, currentArtifactId: artifact.id }, data: { currentArtifactId: null } });
      await tx.artifact.update({
        where: { id: artifact.id },
        data: { status: 'deleted', errorCode: null },
      });
      // 保留最小 tombstone，使 artifactId/fileId 后续读取稳定返回 ARTIFACT_DELETED。
      await tx.file.update({
        where: { id: artifact.fileId },
        data: {
          status: 'rejected',
          errorCode: AGENT_ERROR_CODES.artifactDeleted,
          retryable: false,
          originalKey: null,
          previewKey: null,
          normalizedKey: null,
        },
      });
      const message = await tx.message.findFirst({
        where: { runId: artifact.runId, role: 'assistant', userId: LOCAL_USER_ID },
      });
      if (message) {
        const metadata = this.metadata(message.metadata);
        const blocks = Array.isArray(metadata.blocks)
          ? metadata.blocks.filter(
              (block) =>
                !(
                  typeof block === 'object' &&
                  block !== null &&
                  'type' in block &&
                  'artifactId' in block &&
                  block.type === 'artifact' &&
                  block.artifactId === artifact.id
                ),
            )
          : undefined;
        await tx.message.update({
          where: { id: message.id },
          data: {
            metadata: {
              ...metadata,
              ...(blocks ? { blocks } : {}),
            } as Prisma.InputJsonValue,
          },
        });
      }
    });
    return { deletedArtifactId: artifact.id, deletedFileId: artifact.fileId };
  }

  private async findOwned(id: string) {
    const artifact = await this.prisma.artifact.findFirst({ where: { id, userId: LOCAL_USER_ID }, include: { file: true, series: true } });
    if (!artifact) throw new NotFoundException({ code: AGENT_ERROR_CODES.artifactNotFound, detail: '产物不存在。' });
    return artifact;
  }

  private toRef(artifact: { id: string; fileId: string; status: string; errorCode: string | null; createdAt: Date; runId: string; seriesId: string; versionNumber: number; parentArtifactId?: string | null; sourceArtifactId?: string | null; operation: string; changeSummary?: string | null; series?: { logicalName: string; currentArtifactId: string | null }; file: { fileName: string; mediaType: string; fileKind: string; size: number; lineCount: number | null; characterCount: number | null } }): ArtifactRef {
    return {
      artifactId: artifact.id,
      fileId: artifact.fileId,
      fileName: artifact.file.fileName,
      mediaType: artifact.file.mediaType,
      fileKind: artifact.file.fileKind as ArtifactRef['fileKind'],
      size: artifact.file.size,
      status: artifact.status as ArtifactRef['status'],
      createdAt: artifact.createdAt.toISOString(),
      seriesId: artifact.seriesId,
      logicalName: artifact.series?.logicalName ?? artifact.file.fileName,
      versionNumber: artifact.versionNumber,
      runId: artifact.runId,
      operation: artifact.operation as ArtifactRef['operation'],
      isCurrent: artifact.series?.currentArtifactId === artifact.id,
      ...(artifact.parentArtifactId ? { parentArtifactId: artifact.parentArtifactId } : {}),
      ...(artifact.sourceArtifactId ? { sourceArtifactId: artifact.sourceArtifactId } : {}),
      ...(artifact.changeSummary ? { changeSummary: artifact.changeSummary } : {}),
      ...(artifact.errorCode ? { errorCode: artifact.errorCode } : {}),
      ...(artifact.file.lineCount != null ? { lineCount: artifact.file.lineCount } : {}),
      ...(artifact.file.characterCount != null ? { characterCount: artifact.file.characterCount } : {}),
    };
  }

  private reportRef(report: any): ReportRef { return { reportId: report.id, artifactId: report.artifactId, runId: report.runId, title: report.title, summary: report.summary, sourceIds: Array.isArray(report.sourceIds) ? report.sourceIds : [], fileIds: Array.isArray(report.fileIds) ? report.fileIds : [], status: report.status, createdAt: report.createdAt.toISOString(), updatedAt: report.updatedAt.toISOString() }; }

  private seriesRef(series: { id: string; sessionId: string; logicalName: string; currentArtifactId: string | null; createdAt: Date; updatedAt: Date; artifacts: Array<Parameters<ArtifactsService['toRef']>[0]> }): ArtifactSeriesRef {
    return { seriesId: series.id, sessionId: series.sessionId, logicalName: series.logicalName, currentArtifactId: series.currentArtifactId, createdAt: series.createdAt.toISOString(), updatedAt: series.updatedAt.toISOString(), versions: series.artifacts.map((artifact) => this.toRef(artifact)) };
  }

  private deleted(): BadRequestException {
    return new BadRequestException({ code: AGENT_ERROR_CODES.artifactDeleted, detail: '产物已删除。' });
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
  }

  private metadata(value: Prisma.JsonValue): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private versionContext(value: Prisma.JsonValue): { seriesId: string; baseArtifactId: string; expectedCurrentArtifactId: string; changeSummary?: string } | undefined {
    const metadata = this.metadata(value).artifactVersionContext;
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return undefined;
    const valueRecord = metadata as Record<string, unknown>;
    if (typeof valueRecord.seriesId !== 'string' || typeof valueRecord.baseArtifactId !== 'string' || typeof valueRecord.expectedCurrentArtifactId !== 'string') return undefined;
    return {
      seriesId: valueRecord.seriesId,
      baseArtifactId: valueRecord.baseArtifactId,
      expectedCurrentArtifactId: valueRecord.expectedCurrentArtifactId,
      ...(typeof valueRecord.changeSummary === 'string' ? { changeSummary: valueRecord.changeSummary } : {}),
    };
  }

  private versionConflict(): ConflictException {
    return new ConflictException({ code: AGENT_ERROR_CODES.artifactVersionConflict, detail: '产物已产生新版本，请基于最新版本重试。' });
  }
}
