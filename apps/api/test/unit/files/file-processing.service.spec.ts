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
    expect(result.parserVersion).toBe('c1-b2-v1');
    expect(result.locations).toEqual([
      { startOffset: 0, endOffset: 3, line: 1 },
      { startOffset: 4, endOffset: 7, line: 2 },
    ]);
  });

  it('repairs UTF-8 filenames decoded as latin1 by multipart parsing', async () => {
    const result = await service.parse({
      buffer: Buffer.from('中文文件内容'),
      mimetype: 'text/plain',
      originalname: 'æµè¯æä»¶.txt',
    });
    expect(result.fileName).toBe('测试文件.txt');
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

  it('recognizes modern Office MIME types and rejects legacy Office formats', async () => {
    const officeHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    for (const [extension, mediaType, fileKind] of [
      ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
      ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
      ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
    ] as const) {
      await expect(
        service.validateAndPrepare({
          buffer: officeHeader,
          mimetype: 'application/octet-stream',
          originalname: `中文.${extension}`,
        }),
      ).resolves.toMatchObject({ fileKind, mediaType, fileName: `中文.${extension}` });
    }
    await expect(
      service.validateAndPrepare({
        buffer: Buffer.from('legacy'),
        mimetype: 'application/msword',
        originalname: '旧文档.doc',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FILE_TYPE_UNSUPPORTED' }),
    });
  });

  it('parses a Chinese DOCX buffer into normalized content', async () => {
    const docx = Buffer.from(
      'UEsDBBQAAAAIAJMQKV33S4B1wgAAAHYBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QuQ7CMAyGX6XKiqgRAwOiLMAKDLyAlbptRC7FLsfbk3INCBjt//gsLw7XSFxcnPVcqU4kzgFYd+SQyxDJZ6UJyaHkMbUQUR+xJZhOJjPQwQt5GcvQoZaLNTXYWyk2l7xmE3ylEllWxephHFiVwhit0ShZh5OvPyjjJ6HMybuHOxN5lA0KvhIG5TfgmdudKCVTU7HHJFt02QXnkGqog+5dTpb/a77cGZrGaHrnh7aYgiZm41tny7fi0PjX/XB/9/IGUEsDBBQAAAAIAJMQKV1hey9DiQAAAPIAAAALAAAAX3JlbHMvLnJlbHONzzsOAiEQBuCrEA6ws1pYGKCy2dZ4AQLDIy6PDBj19lJYrMbCcuaffH9GnHHVPZbcQqyNPdKam+Sh93oEaCZg0m0qFfNIXKGk+xjJQ9Xmqj3Cfp4PQFuDK7E12WIlp8XuOLs8K/5jF+eiwVMxt4S5/6j4uhiyJo9d8nshC/a9ngbLQQn4eFG9AFBLAwQUAAAACACTECldLXqblpAAAADLAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1ssym3SslPLs1NzStRqMjNySu2KrdVyigpKbDS1y9OzkjNTSzWyy9IzQPKpeUX5SaWALlF6frl+UUpBUX5yanFxZl56bk5+kYGBmb6uYmZeUp2NuVWSfkplSC6AEQUgYgSuyc71j6b1v5sQfvLRTNs9EEiILIITBagK362djFQ8dO21qfrdmJRrA+zQh/hfDsAUEsBAhQDFAAAAAgAkxApXfdLgHXCAAAAdgEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACACTECldYXsvQ4kAAADyAAAACwAAAAAAAAAAAAAAgAHzAAAAX3JlbHMvLnJlbHNQSwECFAMUAAAACACTECldLXqblpAAAADLAAAAEQAAAAAAAAAAAAAAgAGlAQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAZAIAAAAA',
      'base64',
    );
    const result = await service.parse({
      buffer: docx,
      mimetype: 'application/octet-stream',
      originalname: '中文文档.docx',
    });
    expect(result.fileKind).toBe('docx');
    expect(result.normalizedContent).toContain('中文标题');
    expect(result.normalizedContent).toContain('正文内容');
    expect(result.overview).toMatchObject({ format: 'docx' });
  });
});
