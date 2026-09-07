import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  FileProcessingService,
  MAX_PARSED_CODE_POINTS,
} from '../../../src/files/file-processing.service';

describe('FileProcessingService', () => {
  const service = new FileProcessingService();

  it('parses text and preserves stable content metadata', async () => {
    const result = await service.parse({
      buffer: Buffer.from('第一行\n第二行'),
      mimetype: 'text/plain',
      originalname: 'notes.txt',
    });
    expect(result.fileKind).toBe('text');
    expect(result.normalizedContent).toBe('第一行\n第二行');
    expect(result.lineCount).toBe(2);
    expect(result.contentHash).toHaveLength(64);
    expect(result.parserVersion).toBe('c1-b1-v1');
    expect(result.locations).toEqual([
      { startOffset: 0, endOffset: 3, line: 1 },
      { startOffset: 4, endOffset: 7, line: 2 },
    ]);
  });

  it('rejects blank text and inconsistent CSV rows', async () => {
    await expect(
      service.parse({
        buffer: Buffer.from(' \n\t'),
        mimetype: 'text/plain',
        originalname: 'blank.txt',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FILE_EMPTY' }),
    });
    await expect(
      service.parse({
        buffer: Buffer.from('name,age\nAlice,18\nBob,20,extra'),
        mimetype: 'text/csv',
        originalname: 'bad.csv',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FILE_PARSE_FAILED' }),
    });
  });

  it('formats JSON and exposes its root type', async () => {
    const result = await service.parse({
      buffer: Buffer.from('{"ok":true}'),
      mimetype: 'application/json',
      originalname: 'data.json',
    });
    expect(result.normalizedContent).toContain('"ok": true');
    expect(result.overview).toMatchObject({ format: 'json', rootType: 'object' });
  });

  it('rejects parsed content beyond the MVP limit without truncating', async () => {
    await expect(
      service.parse({
        buffer: Buffer.from('x'.repeat(MAX_PARSED_CODE_POINTS + 1)),
        mimetype: 'text/plain',
        originalname: 'large.txt',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FILE_CONTENT_TOO_LARGE' }),
    });
  });

  it('rejects invalid JSON with a stable error', async () => {
    await expect(
      service.parse({
        buffer: Buffer.from('{'),
        mimetype: 'application/json',
        originalname: 'bad.json',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
