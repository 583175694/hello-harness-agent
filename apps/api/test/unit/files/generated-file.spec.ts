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
      aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }),
    },
    fileCleanupTask: { upsert: vi.fn() },
  };
  const storage = {
    putOriginal: vi.fn().mockResolvedValue({ objectKey: 'original' }),
    putNormalized: vi.fn().mockResolvedValue({ objectKey: 'normalized' }),
    deleteFile: vi.fn(),
  };
  const service = new FilesService(
    prisma as never,
    {} as never,
    storage as never,
    { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
  );
  return { service, prisma, storage };
}

describe('FilesService generated files', () => {
  it('accepts ordinary names containing u/0 and stores formatted JSON separately from the source', async () => {
    const { service, storage } = createService();
    await service.createGenerated({
      sessionId: 'session-1',
      fileId: 'file-1',
      fileName: 'summary0.json',
      content: '{"a":1}',
    });

    expect(storage.putOriginal).toHaveBeenCalledWith(
      expect.objectContaining({ content: Buffer.from('{"a":1}') }),
    );
    expect(storage.putNormalized).toHaveBeenCalledWith(
      expect.objectContaining({ content: Buffer.from('{\n  "a": 1\n}') }),
    );
  });

  it('removes an unassociated File and schedules cleanup when partial storage cleanup fails', async () => {
    const { service, prisma, storage } = createService();
    storage.putNormalized.mockRejectedValue(new Error('write failed'));
    storage.deleteFile.mockRejectedValue(new Error('delete failed'));

    await expect(
      service.createGenerated({
        sessionId: 'session-1',
        fileId: 'file-1',
        fileName: 'a.txt',
        content: 'a',
      }),
    ).rejects.toMatchObject({ response: { code: 'FILE_STORAGE_FAILED' } });
    expect(prisma.fileCleanupTask.upsert).toHaveBeenCalled();
    expect(prisma.file.deleteMany).toHaveBeenCalledWith({
      where: { id: 'file-1', origin: 'agent_generated' },
    });
  });

  it('does not create a File when document rendering is rejected', async () => {
    const { service, prisma } = createService();
    await expect(
      service.createGenerated({
        sessionId: 'session-1',
        fileId: 'file-1',
        fileName: 'unsafe.html',
        content: '<iframe src="https://example.com"></iframe>',
      }),
    ).rejects.toMatchObject({ response: { code: 'GENERATED_FILE_RENDER_FAILED' } });
    expect(prisma.file.create).not.toHaveBeenCalled();
  });

  it('cleans up a rendered File when cancellation arrives before it can be committed', async () => {
    const { service, prisma, storage } = createService();
    const controller = new AbortController();
    storage.putNormalized.mockImplementation(async () => {
      controller.abort();
      return { objectKey: 'normalized' };
    });

    await expect(
      service.createGenerated({
        sessionId: 'session-1',
        fileId: 'file-1',
        fileName: 'cancel.xlsx',
        sheets: [{ name: 'Sheet1', rows: [['value']] }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(storage.deleteFile).toHaveBeenCalled();
    expect(prisma.file.deleteMany).toHaveBeenCalledWith({
      where: { id: 'file-1', origin: 'agent_generated' },
    });
  });
});

describe('FilesService tool result files', () => {
  it('stores formatted tool output as original and normalized text without the generated-file cap', async () => {
    const { service, prisma, storage } = createService();
    const content = `${'行情'.repeat(50)}\n{"close": 10}`;
    const result = await service.createToolResultFile({
      sessionId: 'session-1',
      toolName: 'web_search',
      toolCallId: 'call-1',
      content,
    });

    expect(result.fileName).toBe('web_search_call-1.txt');
    expect(storage.putOriginal).toHaveBeenCalledWith(
      expect.objectContaining({ content: Buffer.from(content, 'utf8') }),
    );
    expect(storage.putNormalized).toHaveBeenCalledWith(
      expect.objectContaining({ content: Buffer.from(content, 'utf8') }),
    );
    expect(prisma.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ origin: 'tool_result', status: 'processing' }),
      }),
    );
    expect(prisma.file.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parserVersion: 'tool-result-v1',
          status: 'ready',
        }),
      }),
    );
  });

  it('persists valid JSON tool output as a json file', async () => {
    const { service, prisma } = createService();
    const result = await service.createToolResultFile({
      sessionId: 'session-1',
      toolName: 'web_fetch',
      toolCallId: 'call-json',
      content: '{"items":[1,2,3]}',
    });
    expect(result.fileName).toBe('web_fetch_call-json.json');
    expect(prisma.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileKind: 'json',
          mediaType: 'application/json',
          origin: 'tool_result',
        }),
      }),
    );
  });
});
