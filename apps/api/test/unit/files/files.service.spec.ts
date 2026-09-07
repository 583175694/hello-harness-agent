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
  const storage = { readObject: vi.fn() };
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
    storage,
    logger,
  };
}

describe('FilesService recovery', () => {
  it('converges processing files after restart and preserves storage distinction', async () => {
    const { service, prisma, logger } = makeService();
    prisma.file.findMany.mockResolvedValue([
      {
        id: 'file-with-object',
        sessionId: 'session-1',
        originalKey: 'sessions/session-1/files/file-with-object/original',
      },
      { id: 'file-without-object', sessionId: 'session-1', originalKey: null },
    ]);

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
