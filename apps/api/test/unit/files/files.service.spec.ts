import { describe, expect, it, vi } from 'vitest';
import { FilesService } from '../../../src/files/files.service';

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    session: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    file: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
  };
  const storage = {
    readObject: vi.fn(),
    putNormalized: vi.fn(),
    putOriginal: vi.fn(),
    putPreview: vi.fn(),
    deleteFile: vi.fn(),
  };
  const processor = { parse: vi.fn() };
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  Object.assign(prisma, overrides);
  return {
    service: new FilesService(
      prisma as never,
      processor as never,
      storage as never,
      logger as never,
    ),
    prisma,
    processor,
    storage,
    logger,
  };
}

describe('FilesService importGeneratedBytes', () => {
  it('stores sandbox PNG collect as image with preview', async () => {
    const { service, prisma, storage } = makeService();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    prisma.session.findUnique.mockResolvedValue({ id: 'session-1', userId: 'local-user' });
    prisma.file.create.mockResolvedValue({});
    storage.putOriginal.mockImplementation(async (input) => ({
      objectKey: `sessions/session-1/files/${input.fileId}/original`,
    }));
    storage.putPreview.mockImplementation(async (input) => ({
      objectKey: `sessions/session-1/files/${input.fileId}/preview`,
    }));
    prisma.file.update.mockImplementation(async ({ where, data }) => ({
      id: where.id,
      fileName: 'shot.png',
      mediaType: 'image/png',
      fileKind: 'image',
      size: png.length,
      width: null,
      height: null,
      status: 'ready',
      errorCode: null,
    }));

    const ref = await service.importGeneratedBytes({
      sessionId: 'session-1',
      fileName: 'shot.png',
      data: png,
    });

    expect(storage.putOriginal).toHaveBeenCalled();
    expect(storage.putPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        fileId: ref.fileId,
        contentType: 'image/png',
      }),
    );
    expect(storage.putNormalized).not.toHaveBeenCalled();
    expect(prisma.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          previewKey: `sessions/session-1/files/${ref.fileId}/preview`,
          parserVersion: 'c3-d-sandbox-image',
          status: 'ready',
        }),
      }),
    );
    expect(ref.fileKind).toBe('image');
    expect(ref.previewUrl).toBe(`/api/agent/files/${ref.fileId}/preview`);
  });
});

describe('FilesService recovery', () => {
  it('converges processing files after restart and preserves storage distinction', async () => {
    const { service, prisma, logger } = makeService();
    prisma.file.findMany
      .mockResolvedValueOnce([
        {
          id: 'file-with-object',
          sessionId: 'session-1',
          originalKey: 'sessions/session-1/files/file-with-object/original',
        },
        { id: 'file-without-object', sessionId: 'session-1', originalKey: null },
      ])
      .mockResolvedValueOnce([]);

    await service.onModuleInit();

    expect(prisma.file.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'file-with-object', status: 'processing' },
        data: expect.objectContaining({
          status: 'failed',
          retryable: true,
          errorCode: 'FILE_PARSE_TIMEOUT',
        }),
      }),
    );
    expect(prisma.file.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'file-without-object', status: 'processing' },
        data: expect.objectContaining({
          status: 'failed',
          retryable: true,
          errorCode: 'FILE_STORAGE_FAILED',
        }),
      }),
    );
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('rebuilds normalized COS objects for ready B.1 files during startup', async () => {
    const { service, prisma, processor, storage } = makeService();
    prisma.file.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'legacy-file',
        sessionId: 'session-1',
        fileName: 'legacy.txt',
        mediaType: 'text/plain',
      },
    ]);
    prisma.file.updateMany.mockResolvedValue({ count: 1 });
    storage.readObject.mockResolvedValue({ content: Buffer.from('旧文件正文') });
    storage.putNormalized.mockResolvedValue({
      objectKey: 'sessions/session-1/files/legacy-file/normalized',
    });
    processor.parse.mockResolvedValue({
      fileKind: 'text',
      normalizedContent: '旧文件正文',
      contentHash: 'normalized-hash',
      parserVersion: 'c1-b1-v1',
      pageCount: null,
      lineCount: 1,
      characterCount: 5,
      overview: { format: 'text' },
    });

    await service.onModuleInit();

    expect(storage.readObject).toHaveBeenCalledWith({
      sessionId: 'session-1',
      fileId: 'legacy-file',
      variant: 'original',
    });
    expect(storage.putNormalized).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        fileId: 'legacy-file',
        content: Buffer.from('旧文件正文'),
      }),
    );
    expect(prisma.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'legacy-file' },
        data: expect.objectContaining({
          normalizedKey: 'sessions/session-1/files/legacy-file/normalized',
          status: 'ready',
        }),
      }),
    );
  });

  it('logs and returns a stable error when retry cannot read COS', async () => {
    const { service, prisma, storage, logger } = makeService();
    prisma.file.findFirst.mockResolvedValue({
      id: 'file-1',
      sessionId: 'session-1',
      retryable: true,
      originalKey: 'original',
      fileName: 'notes.txt',
      mediaType: 'text/plain',
      fileKind: 'text',
      size: 10,
      width: null,
      height: null,
      status: 'failed',
      errorCode: 'FILE_PARSE_TIMEOUT',
    });
    storage.readObject.mockRejectedValue(new Error('COS unavailable'));

    await expect(service.retry('local-user', 'file-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FILE_STORAGE_FAILED' }),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('阶段=read_original'),
      'FilesService',
    );
    expect(prisma.file.update).not.toHaveBeenCalled();
  });
});
