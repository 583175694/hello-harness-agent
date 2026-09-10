import { describe, expect, it, vi } from 'vitest';

import { FilesService } from '../../../src/files/files.service';

function createService() {
  const prisma = {
    session: { findFirst: vi.fn().mockResolvedValue({ id: 'session-1' }) },
    file: {
      create: vi.fn(),
      update: vi.fn((input) => ({
        ...input.data,
        id: 'file-1',
        fileName: 'summary0.json',
        mediaType: 'application/json',
        fileKind: 'json',
        origin: 'agent_generated',
        size: 7,
        width: null,
        height: null,
        errorCode: null,
      })),
      deleteMany: vi.fn(),
    },
    fileCleanupTask: { upsert: vi.fn() },
  };
  const storage = {
    putOriginal: vi.fn().mockResolvedValue({ objectKey: 'original' }),
    putNormalized: vi.fn().mockResolvedValue({ objectKey: 'normalized' }),
    deleteFile: vi.fn(),
  };
  const service = new FilesService(prisma as never, {} as never, storage as never, { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as never);
  return { service, prisma, storage };
}

describe('FilesService generated files', () => {
  it('accepts ordinary names containing u/0 and stores formatted JSON separately from the source', async () => {
    const { service, storage } = createService();
    await service.createGenerated({ sessionId: 'session-1', fileId: 'file-1', fileName: 'summary0.json', content: '{"a":1}' });

    expect(storage.putOriginal).toHaveBeenCalledWith(expect.objectContaining({ content: Buffer.from('{"a":1}') }));
    expect(storage.putNormalized).toHaveBeenCalledWith(expect.objectContaining({ content: Buffer.from('{\n  "a": 1\n}') }));
  });

  it('removes an unassociated File and schedules cleanup when partial storage cleanup fails', async () => {
    const { service, prisma, storage } = createService();
    storage.putNormalized.mockRejectedValue(new Error('write failed'));
    storage.deleteFile.mockRejectedValue(new Error('delete failed'));

    await expect(service.createGenerated({ sessionId: 'session-1', fileId: 'file-1', fileName: 'a.txt', content: 'a' }))
      .rejects.toMatchObject({ response: { code: 'FILE_STORAGE_FAILED' } });
    expect(prisma.fileCleanupTask.upsert).toHaveBeenCalled();
    expect(prisma.file.deleteMany).toHaveBeenCalledWith({ where: { id: 'file-1', origin: 'agent_generated' } });
  });
});
