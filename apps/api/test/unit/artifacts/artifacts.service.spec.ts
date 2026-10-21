import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ArtifactsService } from '../../../src/artifacts/artifacts.service';

const file = {
  id: 'file-1',
  fileName: 'result.md',
  mediaType: 'text/markdown',
  fileKind: 'markdown',
  origin: 'agent_generated',
  size: 8,
  width: null,
  height: null,
  status: 'ready',
  errorCode: null,
  originalKey: 'sessions/session-1/files/file-1/original',
  lineCount: 1,
  characterCount: 8,
};

const artifact = {
  id: 'artifact-1',
  fileId: file.id,
  userId: 'local-user',
  sessionId: 'session-1',
  runId: 'run-1',
  toolCallId: 'call-1',
  status: 'ready',
  errorCode: null,
  createdAt: new Date('2026-09-09T00:00:00.000Z'),
  seriesId: 'series-1',
  versionNumber: 1,
  parentArtifactId: null,
  sourceArtifactId: null,
  operation: 'create',
  changeSummary: null,
  series: { logicalName: 'result.md', currentArtifactId: 'artifact-1' },
  file,
};

function createService() {
  const tx = {
    artifact: { update: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
    artifactSeries: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    file: { update: vi.fn() },
    message: { findFirst: vi.fn(), update: vi.fn() },
  };
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue({ id: 'session-1', userId: 'local-user' }),
    },
    agentRun: { findFirst: vi.fn().mockResolvedValue({ id: 'run-1' }) },
    artifact: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn().mockResolvedValue(1) },
    artifactSeries: { findFirst: vi.fn() },
    report: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    file: { count: vi.fn() },
    message: { findFirst: vi.fn() },
    fileCleanupTask: { upsert: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const files = {
    createGenerated: vi.fn(),
    deleteGeneratedFile: vi.fn(),
    toPublicRef: vi.fn((value, _preview, overrides) => ({
      fileId: value.id,
      fileName: value.fileName,
      mediaType: value.mediaType,
      fileKind: value.fileKind,
      origin: value.origin,
      size: value.size,
      status: value.status,
      ...overrides,
    })),
  };
  const storage = { deleteFile: vi.fn(), readObject: vi.fn() };
  tx.artifact.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...artifact,
    ...data,
    file: { ...file, id: String(data.fileId) },
    series: { logicalName: 'result.md', currentArtifactId: String(data.id) },
  }));
  tx.artifact.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    ...artifact,
    id: where.id,
    series: { logicalName: 'result.md', currentArtifactId: where.id },
  }));
  return {
    service: new ArtifactsService(prisma as never, files as never, storage as never),
    prisma,
    files,
    storage,
    tx,
  };
}

describe('ArtifactsService', () => {
  it('validates Run and Session ownership before creating a File', async () => {
    const { service, prisma, files } = createService();
    prisma.agentRun.findFirst.mockResolvedValue(null);

    await expect(service.create({ sessionId: 'other', runId: 'run-1', toolCallId: 'call-1', fileName: 'a.txt', content: 'a' }))
      .rejects.toMatchObject({ response: { code: 'RUN_NOT_FOUND' } });
    expect(files.createGenerated).not.toHaveBeenCalled();
  });

  it('returns the same ready Artifact when a tool call is replayed', async () => {
    const { service, prisma, files } = createService();
    prisma.artifact.findFirst.mockResolvedValue(artifact);

    await expect(service.create({ sessionId: 'session-1', runId: 'run-1', toolCallId: 'call-1', fileName: 'a.txt', content: 'a' }))
      .resolves.toMatchObject({ artifact: { artifactId: 'artifact-1' }, file: { fileId: 'file-1' } });
    expect(files.createGenerated).not.toHaveBeenCalled();
  });

  it('allows one Run to create multiple Reports with different tool calls', async () => {
    const { service, prisma, files } = createService();
    prisma.report.findFirst.mockResolvedValue(null);
    prisma.artifact.findFirst.mockResolvedValue(null);
    files.createGenerated.mockImplementation(async ({ fileName }: { fileName: string }) => ({
      fileId: `file-${fileName}`,
    }));
    prisma.report.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
      updatedAt: new Date('2026-09-15T00:00:00.000Z'),
      artifact: { ...artifact, id: String(data.artifactId) },
    }));

    const base = { sessionId: 'session-1', runId: 'run-1', summary: '摘要', content: '# 报告' };
    await service.createReport({ ...base, toolCallId: 'report-call-1', title: '上证指数', fileName: 'sse.md' });
    await service.createReport({ ...base, toolCallId: 'report-call-2', title: '创业板指', fileName: 'chinext.md' });

    expect(prisma.report.create).toHaveBeenCalledTimes(2);
    expect(prisma.report.create.mock.calls.map(([call]) => call.data.runId)).toEqual(['run-1', 'run-1']);
    expect(prisma.report.create.mock.calls.map(([call]) => call.data.title)).toEqual(['上证指数', '创业板指']);
  });

  it('does not block Report creation when source ids are absent from fetched-source metadata', async () => {
    const { service, prisma, files } = createService();
    prisma.report.findFirst.mockResolvedValue(null);
    prisma.artifact.findFirst.mockResolvedValue(null);
    files.createGenerated.mockResolvedValue({ fileId: 'file-report' });
    prisma.report.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
      updatedAt: new Date('2026-09-15T00:00:00.000Z'),
      artifact: { ...artifact, id: String(data.artifactId) },
    }));

    await expect(
      service.createReport({
        sessionId: 'session-1',
        runId: 'run-1',
        toolCallId: 'report-call-1',
        title: '研究报告',
        summary: '摘要',
        fileName: 'report.md',
        content: '# 报告',
        sourceIds: ['source-not-fetched'],
      }),
    ).resolves.toMatchObject({ report: { sourceIds: ['source-not-fetched'] } });
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(prisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sourceIds: ['source-not-fetched'] }) }),
    );
  });

  it('streams the original bytes through the authorized download endpoint', async () => {
    const { service, prisma, storage } = createService();
    prisma.artifact.findFirst.mockResolvedValue(artifact);
    storage.readObject.mockResolvedValue({ content: Buffer.from('# source', 'utf8') });

    await expect(service.download('local-user', 'artifact-1')).resolves.toMatchObject({
      content: Buffer.from('# source', 'utf8'),
      fileName: 'result.md',
      mediaType: 'text/markdown',
    });
    expect(storage.readObject).toHaveBeenCalledWith({
      sessionId: 'session-1',
      fileId: 'file-1',
      variant: 'original',
    });
  });

  it('removes the persisted card and makes both identities unreadable after deletion', async () => {
    const { service, prisma, storage, tx } = createService();
    prisma.artifact.findFirst.mockResolvedValue(artifact);
    tx.message.findFirst.mockResolvedValue({
      id: 'assistant-1',
      metadata: { blocks: [{ type: 'artifact', artifactId: 'artifact-1' }, { type: 'text', id: 'text-1', content: 'done' }] },
    });

    await expect(service.delete('local-user', 'artifact-1')).resolves.toEqual({ deletedArtifactId: 'artifact-1', deletedFileId: 'file-1' });
    expect(storage.deleteFile).toHaveBeenCalledWith({ sessionId: 'session-1', fileId: 'file-1' });
    expect(tx.artifact.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'deleted', errorCode: null } }));
    expect(tx.file.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: 'ARTIFACT_DELETED' }) }));
    expect(tx.message.update).toHaveBeenCalledWith(expect.objectContaining({ data: { metadata: expect.objectContaining({ blocks: [{ type: 'text', id: 'text-1', content: 'done' }] }) } }));
  });

  it('keeps metadata intact and registers cleanup when object deletion fails', async () => {
    const { service, prisma, storage } = createService();
    prisma.artifact.findFirst.mockResolvedValue(artifact);
    storage.deleteFile.mockRejectedValue(new Error('COS unavailable'));

    await expect(service.delete('local-user', 'artifact-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.fileCleanupTask.upsert).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
