import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ArtifactRef, CreateFileResult } from '@harness/agent-protocol';
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

  async create(input: {
    sessionId: string;
    runId: string;
    toolCallId: string;
    fileName: string;
    content: string;
  }): Promise<CreateFileResult> {
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: input.runId,
        sessionId: input.sessionId,
        session: { userId: LOCAL_USER_ID },
      },
      select: { id: true },
    });
    if (!run)
      throw new NotFoundException({
        code: AGENT_ERROR_CODES.runNotFound,
        detail: '运行不存在或不属于当前会话。',
      });
    const existing = await this.prisma.artifact.findFirst({
      where: {
        runId: input.runId,
        toolCallId: input.toolCallId,
        sessionId: input.sessionId,
        userId: LOCAL_USER_ID,
      },
      include: { file: true },
    });
    if (existing) {
      if (existing.status === 'deleted') throw this.deleted();
      if (existing.status !== 'ready' || existing.file.status !== 'ready')
        throw new BadRequestException({
          code: existing.errorCode ?? AGENT_ERROR_CODES.artifactStorageFailed,
          detail: '该生成调用未成功完成，不会重复创建文件。',
        });
      return {
        artifact: this.toRef(existing),
        file: this.files.toPublicRef(existing.file, false, { artifactId: existing.id }),
      };
    }

    const file = await this.files.createGenerated({
      sessionId: input.sessionId,
      fileName: input.fileName,
      content: input.content,
    });
    try {
      const artifact = await this.prisma.artifact.create({
        data: {
          id: crypto.randomUUID(),
          fileId: file.fileId,
          userId: LOCAL_USER_ID,
          sessionId: input.sessionId,
          runId: input.runId,
          toolCallId: input.toolCallId,
          status: 'ready',
        },
        include: { file: true },
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
          include: { file: true },
        });
        if (replay)
          return {
            artifact: this.toRef(replay),
            file: this.files.toPublicRef(replay.file, false, { artifactId: replay.id }),
          };
      }
      throw error;
    }
  }

  async get(artifactId: string) {
    const artifact = await this.findOwned(artifactId);
    if (artifact.status === 'deleted') throw this.deleted();
    return this.toRef(artifact);
  }

  async preview(artifactId: string) {
    const artifact = await this.findOwned(artifactId);
    if (artifact.status === 'deleted') throw this.deleted();
    if (artifact.status !== 'ready') throw new BadRequestException({ code: AGENT_ERROR_CODES.fileNotReady, detail: '产物尚未准备好。' });
    const result = await this.files.preview(artifact.fileId);
    if ('content' in result) return { content: result.content, contentType: artifact.file.mediaType };
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
    const artifact = await this.prisma.artifact.findFirst({ where: { id, userId: LOCAL_USER_ID }, include: { file: true } });
    if (!artifact) throw new NotFoundException({ code: AGENT_ERROR_CODES.artifactNotFound, detail: '产物不存在。' });
    return artifact;
  }

  private toRef(artifact: { id: string; fileId: string; status: string; errorCode: string | null; createdAt: Date; file: { fileName: string; mediaType: string; fileKind: string; size: number; lineCount: number | null; characterCount: number | null } }): ArtifactRef {
    return {
      artifactId: artifact.id,
      fileId: artifact.fileId,
      fileName: artifact.file.fileName,
      mediaType: artifact.file.mediaType,
      fileKind: artifact.file.fileKind as 'text' | 'markdown' | 'json',
      size: artifact.file.size,
      status: artifact.status as ArtifactRef['status'],
      createdAt: artifact.createdAt.toISOString(),
      ...(artifact.errorCode ? { errorCode: artifact.errorCode } : {}),
      ...(artifact.file.lineCount != null ? { lineCount: artifact.file.lineCount } : {}),
      ...(artifact.file.characterCount != null ? { characterCount: artifact.file.characterCount } : {}),
    };
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
}
