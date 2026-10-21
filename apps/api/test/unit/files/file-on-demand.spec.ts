import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FilesService } from '../../../src/files/files.service';
import { FileReadTool } from '../../../src/tools/file-read.tool';
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
    session: { findUnique: vi.fn().mockResolvedValue({ id: 'session-1', userId: 'local-user' }) },
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
    const result = await service.searchFile('local-user', 'session-1', {
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
      service.readFileLines('local-user', 'session-1', { fileId: 'file-1', startLine: 1, endLine: 1 }),
    ).rejects.toMatchObject({ response: { code: 'FILE_NOT_FOUND' } });

    prisma.file.findFirst.mockResolvedValueOnce(readyFile({ status: 'processing' }));
    await expect(
      service.readFileLines('local-user', 'session-1', { fileId: 'file-1', startLine: 1, endLine: 1 }),
    ).rejects.toMatchObject({ response: { code: 'FILE_NOT_READY' } });
  });

  it('returns the dedicated error when the requested line range is too large', async () => {
    const { service } = createService('a\nb\nc');
    await expect(
      service.readFileLines('local-user', 'session-1', { fileId: 'file-1', startLine: 1, endLine: 151 }),
    ).rejects.toMatchObject({ response: { code: 'FILE_READ_RANGE_TOO_LARGE' } });
  });

  it('reads a finite range and returns complete lines when the result is oversized', async () => {
    const { service } = createService('a\nb\nc');
    await expect(
      service.readFileLines('local-user', 'session-1', { fileId: 'file-1', startLine: 1, endLine: 3 }),
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

    const large = createService(`${'x'.repeat(16_000)}\n${'y'.repeat(16_000)}`);
    await expect(
      large.service.readFileLines('local-user', 'session-1', { fileId: 'file-1', startLine: 1, endLine: 2 }),
    ).resolves.toMatchObject({
      incomplete: true,
      lines: [{ line: 1, text: 'x'.repeat(16_000) }],
    });

    const singleLine = createService('x'.repeat(24_001));
    await expect(
      singleLine.service.readFileLines('local-user', 'session-1', { fileId: 'file-1', startLine: 1, endLine: 1 }),
    ).resolves.toMatchObject({ incomplete: true, lines: [] });
  });

  it('keeps the current PDF page when a read starts after the page marker', async () => {
    const { service } = createService('[[page:2]]\n标题\n正文第一行\n正文第二行');
    await expect(
      service.readFileLines('local-user', 'session-1', { fileId: 'file-1', startLine: 3, endLine: 4 }),
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
      service.searchFile('local-user', 'session-1', { fileId: 'file-1', query: '标题' }),
    ).resolves.toMatchObject({
      incomplete: false,
      matches: [{ lineStart: 2, lineEnd: 3, page: 2, text: '标题\n正文' }],
    });
    await expect(
      service.searchFile('local-user', 'session-1', { fileId: 'file-1', query: 'page' }),
    ).resolves.toMatchObject({ incomplete: false, matches: [] });
  });

  it('truncates oversized search results instead of failing the tool call', async () => {
    const { service } = createService(Array.from({ length: 20 }, (_, index) => `错误 ${index} ${'x'.repeat(900)}`).join('\n'));

    const result = await service.searchFile('local-user', 'session-1', {
      fileId: 'file-1',
      query: '错误',
      maxResults: 8,
    });

    expect(result.incomplete).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
    expect([...result.matches.map((match) => match.text).join('\n')].length).toBeLessThanOrEqual(24_000);
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
      { userId: 'local-user', sessionId: 'session-1', messageId: 'message-1', toolCallId: 'call-1' },
    );
    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'FILE_NOT_READY', retryable: false },
    });

    const reader = new FileReadTool({
      readFile: vi.fn().mockResolvedValue({
        scope: 'lines',
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
    expect(definition.name).toBe('read_file');
    expect(definition.description).toContain('单次最多 150 行');
    expect(definition.description).toContain('scope=file');
    expect(definition.description).toContain('Tool Result stored');
    expect(tool.definition().description).toContain('read_file');
    await expect(
      reader.execute(
        { fileId: 'file-1', scope: 'lines', startLine: 1, endLine: 1 },
        { userId: 'local-user', sessionId: 'session-1', messageId: 'message-1', toolCallId: 'call-2' },
      ),
    ).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('read(scope=file) returns full content for small files and outline for large files', async () => {
    const small = createService('短文章\n第二段');
    await expect(
      small.service.readFile('local-user', 'session-1', { fileId: 'file-1', scope: 'file' }),
    ).resolves.toMatchObject({
      scope: 'file',
      sizeTier: 'small',
      incomplete: false,
      content: '短文章\n第二段',
    });

    const large = createService(`${'段落内容。\n'.repeat(2_000)}结尾`);
    const outline = await large.service.readFile('local-user', 'session-1', {
      fileId: 'file-1',
      scope: 'file',
    });
    expect(outline).toMatchObject({
      scope: 'file',
      sizeTier: expect.stringMatching(/medium|large/),
      incomplete: false,
    });
    expect(outline.scope === 'file' && (outline.sections?.length ?? 0)).toBeGreaterThan(0);
  });

  it('read(scope=section) returns section body by sectionId', async () => {
    const content = '# 标题\n\n正文第一段\n\n## 小节\n\n小节内容';
    const { service } = createService(content);
    const outline = await service.readFile('local-user', 'session-1', {
      fileId: 'file-1',
      scope: 'file',
    });
    const sectionId =
      outline.scope === 'file' ? outline.sections?.find((s) => s.title === '小节')?.sectionId : undefined;
    expect(sectionId).toBeTruthy();
    const section = await service.readFile('local-user', 'session-1', {
      fileId: 'file-1',
      scope: 'section',
      sectionId: sectionId!,
    });
    expect(section).toMatchObject({
      scope: 'section',
      sectionId,
      incomplete: false,
    });
    expect(section.scope === 'section' && section.lines.some((line) => line.text.includes('小节内容'))).toBe(
      true,
    );
  });
});
