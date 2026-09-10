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
  file,
};

function createService() {
  const tx = {
    artifact: { update: vi.fn() },
    file: { update: vi.fn() },
    message: { findFirst: vi.fn(), update: vi.fn() },
  };
  const prisma = {
    agentRun: { findFirst: vi.fn().mockResolvedValue({ id: 'run-1' }) },
    artifact: { findFirst: vi.fn(), create: vi.fn() },
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

  it('streams the original bytes through the authorized download endpoint', async () => {
    const { service, prisma, storage } = createService();
    prisma.artifact.findFirst.mockResolvedValue(artifact);
    storage.readObject.mockResolvedValue({ content: Buffer.from('# source', 'utf8') });

    await expect(service.download('artifact-1')).resolves.toMatchObject({
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

    await expect(service.delete('artifact-1')).resolves.toEqual({ deletedArtifactId: 'artifact-1', deletedFileId: 'file-1' });
    expect(storage.deleteFile).toHaveBeenCalledWith({ sessionId: 'session-1', fileId: 'file-1' });
    expect(tx.artifact.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'deleted', errorCode: null } }));
    expect(tx.file.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: 'ARTIFACT_DELETED' }) }));
    expect(tx.message.update).toHaveBeenCalledWith(expect.objectContaining({ data: { metadata: expect.objectContaining({ blocks: [{ type: 'text', id: 'text-1', content: 'done' }] }) } }));
  });

  it('keeps metadata intact and registers cleanup when object deletion fails', async () => {
    const { service, prisma, storage } = createService();
    prisma.artifact.findFirst.mockResolvedValue(artifact);
    storage.deleteFile.mockRejectedValue(new Error('COS unavailable'));

    await expect(service.delete('artifact-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.fileCleanupTask.upsert).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
