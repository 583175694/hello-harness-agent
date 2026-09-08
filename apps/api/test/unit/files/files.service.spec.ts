import { describe, expect, it, vi } from 'vitest';
import { FilesService } from '../../../src/files/files.service';

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    file: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
  };
  const storage = { readObject: vi.fn(), putNormalized: vi.fn() };
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

    await expect(service.retry('file-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FILE_STORAGE_FAILED' }),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('阶段=read_original'),
      'FilesService',
    );
    expect(prisma.file.update).not.toHaveBeenCalled();
  });
});
