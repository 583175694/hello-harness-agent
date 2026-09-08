import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FilesService } from '../../../src/files/files.service';
import { FileReadLinesTool } from '../../../src/tools/file-read-lines.tool';
import { FileSearchTool } from '../../../src/tools/file-search.tool';
import type { FileStorage } from '../../../src/file-storage/file-storage';

function readyFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    userId: 'local-user',
    sessionId: 'session-1',
    fileName: 'notes.txt',
    mediaType: 'text/plain',
    fileKind: 'text',
    size: 100,
    sha256: 'raw-hash',
    width: null,
    height: null,
    status: 'ready',
    errorCode: null,
    retryable: false,
    originalKey: 'sessions/session-1/files/file-1/original',
    previewKey: null,
    normalizedKey: 'sessions/session-1/files/file-1/normalized',
    contentHash: 'normalized-hash',
    parserVersion: 'c1-b1-v1',
    pageCount: null,
    lineCount: 4,
    characterCount: 50,
    overview: { format: 'text' },
    processingStartedAt: new Date(),
    processingCompletedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createService(content = '第一行\n错误发生在这里\n第三行\n错误再次出现') {
  const file = readyFile();
  const prisma = {
    file: { findFirst: vi.fn().mockResolvedValue(file) },
  };
  const storage = {
    readObject: vi.fn().mockResolvedValue({ content: Buffer.from(content) }),
  };
  const service = new FilesService(
    prisma as never,
    {} as never,
    storage as unknown as FileStorage,
    { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
  );
  return { service, prisma, storage };
}

describe('C1-B.2 file tools', () => {
  it('searches normalized COS text with bounded context and line locations', async () => {
    const { service, storage } = createService();
    const result = await service.searchFile('session-1', {
      fileId: 'file-1',
      query: '错误',
    });

    expect(result).toMatchObject({
      fileId: 'file-1',
      fileName: 'notes.txt',
      incomplete: false,
      matches: [
        { lineStart: 1, lineEnd: 3, text: '第一行\n错误发生在这里\n第三行' },
        { lineStart: 3, lineEnd: 4, text: '第三行\n错误再次出现' },
      ],
    });
    expect(storage.readObject).toHaveBeenCalledWith({
      sessionId: 'session-1',
      fileId: 'file-1',
      variant: 'normalized',
    });
  });

  it('enforces ownership and ready state before reading content', async () => {
    const { service, prisma } = createService();
    prisma.file.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.readFileLines('session-1', { fileId: 'file-1', startLine: 1, endLine: 1 }),
    ).rejects.toMatchObject({ response: { code: 'FILE_NOT_FOUND' } });

    prisma.file.findFirst.mockResolvedValueOnce(readyFile({ status: 'processing' }));
    await expect(
      service.readFileLines('session-1', { fileId: 'file-1', startLine: 1, endLine: 1 }),
    ).rejects.toMatchObject({ response: { code: 'FILE_NOT_READY' } });
  });

  it('returns the dedicated error when the requested line range is too large', async () => {
    const { service } = createService('a\nb\nc');
    await expect(
      service.readFileLines('session-1', { fileId: 'file-1', startLine: 1, endLine: 51 }),
    ).rejects.toMatchObject({ response: { code: 'FILE_READ_RANGE_TOO_LARGE' } });
  });

  it('reads a finite range and rejects an oversized result instead of truncating', async () => {
    const { service } = createService('a\nb\nc');
    await expect(
      service.readFileLines('session-1', { fileId: 'file-1', startLine: 1, endLine: 3 }),
    ).resolves.toMatchObject({
      startLine: 1,
      endLine: 3,
      incomplete: false,
      lines: [
        { line: 1, text: 'a' },
        { line: 2, text: 'b' },
        { line: 3, text: 'c' },
      ],
    });

    const large = createService('x'.repeat(12_001));
    await expect(
      large.service.readFileLines('session-1', { fileId: 'file-1', startLine: 1, endLine: 1 }),
    ).rejects.toMatchObject({ response: { code: 'FILE_READ_RESULT_TOO_LARGE' } });
  });

  it('keeps the current PDF page when a read starts after the page marker', async () => {
    const { service } = createService('[[page:2]]\n标题\n正文第一行\n正文第二行');
    await expect(
      service.readFileLines('session-1', { fileId: 'file-1', startLine: 3, endLine: 4 }),
    ).resolves.toMatchObject({
      lines: [
        { line: 3, page: 2, text: '正文第一行' },
        { line: 4, page: 2, text: '正文第二行' },
      ],
    });
  });

  it('keeps PDF page metadata out of search text and does not count markers as matches', async () => {
    const { service } = createService('[[page:2]]\n标题\n正文');
    await expect(
      service.searchFile('session-1', { fileId: 'file-1', query: '标题' }),
    ).resolves.toMatchObject({
      incomplete: false,
      matches: [{ lineStart: 2, lineEnd: 3, page: 2, text: '标题\n正文' }],
    });
    await expect(
      service.searchFile('session-1', { fileId: 'file-1', query: 'page' }),
    ).resolves.toMatchObject({ incomplete: false, matches: [] });
  });

  it('exposes stable model tool declarations and maps storage errors safely', async () => {
    const files = {
      searchFile: vi
        .fn()
        .mockRejectedValue(
          new BadRequestException({ code: 'FILE_NOT_READY', detail: 'not ready' }),
        ),
    };
    const tool = new FileSearchTool(files as never);
    expect(tool.definition().name).toBe('search_file');
    const result = await tool.execute(
      { fileId: 'file-1', query: 'term' },
      { sessionId: 'session-1', messageId: 'message-1', toolCallId: 'call-1' },
    );
    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'FILE_NOT_READY', retryable: false },
    });

    const reader = new FileReadLinesTool({
      readFileLines: vi.fn().mockResolvedValue({
        fileId: 'file-1',
        fileName: 'a.txt',
        mediaType: 'text/plain',
        startLine: 1,
        endLine: 1,
        incomplete: false,
        lines: [{ line: 1, text: 'a' }],
      }),
    } as never);
    const definition = reader.definition();
    expect(definition.description).toContain('单次最多读取 50 行');
    expect(definition.description).toContain('1-50、51-100');
    expect(definition.parameters.properties.endLine.description).toContain(
      'endLine - startLine + 1',
    );
    await expect(
      reader.execute(
        { fileId: 'file-1', startLine: 1, endLine: 1 },
        { sessionId: 'session-1', messageId: 'message-1', toolCallId: 'call-2' },
      ),
    ).resolves.toMatchObject({ status: 'succeeded' });
  });
});
