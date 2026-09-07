import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { createHash } from 'node:crypto';

// C1-B.1 的容量、页数、正文和解析时间上限集中在解析层定义。
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SESSION_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_PARSED_CODE_POINTS = 40_000;
export const MAX_PDF_PAGES = 200;
export const FILE_PARSE_TIMEOUT_MS = 30_000;
export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const ALLOWED_DOCUMENT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
]);
const MAX_DECODED_PIXELS = 40_000_000;

type FileKind = 'image' | 'text' | 'markdown' | 'csv' | 'json' | 'pdf';
export type ParsedFile = {
  fileKind: FileKind;
  mediaType: string;
  fileName: string;
  size: number;
  sha256: string;
  width?: number;
  height?: number;
  normalizedContent?: string;
  contentHash?: string;
  parserVersion?: string;
  pageCount?: number;
  lineCount?: number;
  characterCount?: number;
  overview?: Record<string, unknown>;
  // 定位偏移基于规范化正文，供 Run 注入时恢复行号或页码。
  locations?: Array<{ startOffset: number; endOffset: number; line?: number; page?: number }>;
  preview?: Buffer;
  previewType?: string;
};

@Injectable()
export class FileProcessingService {
  // 执行上传阶段的快速校验，文本正文留到后台任务解析。
  async validateAndPrepare(file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  }): Promise<ParsedFile> {
    if (file.buffer.length === 0) throw this.reject('FILE_EMPTY', '文件为空。');
    if (file.buffer.length > MAX_FILE_BYTES)
      throw this.reject('FILE_TOO_LARGE', '文件超过 20 MiB 限制。');
    const mediaType = normalizeMediaType(file.mimetype, file.originalname);
    if (!ALLOWED_IMAGE_TYPES.has(mediaType) && !ALLOWED_DOCUMENT_TYPES.has(mediaType))
      throw this.reject(
        'FILE_TYPE_UNSUPPORTED',
        '仅支持图片、TXT、Markdown、CSV、JSON 和 PDF 文件。',
      );
    if (!matchesMagic(file.buffer, mediaType))
      throw this.reject('FILE_SIGNATURE_MISMATCH', '文件类型与实际内容不一致。');
    if (ALLOWED_IMAGE_TYPES.has(mediaType)) return this.processImage(file, mediaType);
    return {
      fileKind: kindFor(mediaType),
      mediaType,
      fileName: file.originalname,
      size: file.buffer.length,
      sha256: sha256(file.buffer),
    };
  }

  // 统一解析入口，并为文本类文件增加超时保护。
  async parse(file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  }): Promise<ParsedFile> {
    const prepared = await this.validateAndPrepare(file);
    if (prepared.fileKind === 'image') return prepared;
    return withTimeout(this.parseDocument(file.buffer, prepared), FILE_PARSE_TIMEOUT_MS);
  }

  // 将各类文档转换为可注入模型的规范化文本和定位信息。
  private async parseDocument(buffer: Buffer, prepared: ParsedFile): Promise<ParsedFile> {
    let normalizedContent = '';
    let pageCount: number | undefined;
    let locations: ParsedFile['locations'];
    let overview: Record<string, unknown> = { format: prepared.fileKind };
    if (prepared.fileKind === 'pdf') {
      // PDF 按页保留边界，后续引用时可恢复页码。
      const parser = new PDFParse({ data: buffer });
      try {
        const info = await parser.getInfo();
        pageCount = info.total;
        if (pageCount > MAX_PDF_PAGES)
          throw this.reject('PDF_PAGE_LIMIT_EXCEEDED', 'PDF 页数超过 200 页限制。');
        const result = await parser.getText();
        const chunks = result.pages.map((page) => `[[page:${page.num}]]\n${page.text}`);
        normalizedContent = chunks.join('\n\n');
        let offset = 0;
        locations = chunks.map((chunk, index) => {
          const location = {
            startOffset: offset,
            endOffset: offset + chunk.length,
            page: result.pages[index]!.num,
          };
          offset += chunk.length + (index < chunks.length - 1 ? 2 : 0);
          return location;
        });
        overview = { format: 'pdf', pageCount };
      } finally {
        await parser.destroy();
      }
      if (!normalizedContent.trim())
        throw this.reject('PDF_TEXT_UNAVAILABLE', 'PDF 不包含可提取文本，当前版本不支持 OCR。');
    } else {
      const text = decodeUtf8(buffer);
      if (!text.trim()) throw this.reject('FILE_EMPTY', '文件内容为空。');
      if (prepared.fileKind === 'json') {
        // JSON 先校验再格式化，避免把非法结构交给模型。
        let value: unknown;
        try {
          value = JSON.parse(text);
        } catch {
          throw this.reject('FILE_PARSE_FAILED', 'JSON 文件格式无效。');
        }
        normalizedContent = JSON.stringify(value, null, 2);
        overview = { format: 'json', rootType: Array.isArray(value) ? 'array' : typeof value };
      } else if (prepared.fileKind === 'csv') {
        // CSV 规范化为稳定的逐行表格文本。
        const rows = parseCsv(text);
        if (!rows.length) throw this.reject('FILE_PARSE_FAILED', 'CSV 文件没有可解析内容。');
        normalizedContent = rows
          .map((row) =>
            row
              .map((cell) =>
                cell.includes(',') || cell.includes('"') ? `"${cell.replaceAll('"', '""')}"` : cell,
              )
              .join(' | '),
          )
          .join('\n');
        overview = { format: 'csv', columns: rows[0], rowCount: Math.max(0, rows.length - 1) };
      } else normalizedContent = text;
    }
    // 超限内容明确拒绝，不在解析阶段静默截断。
    const characterCount = [...normalizedContent].length;
    if (!normalizedContent.trim()) throw this.reject('FILE_EMPTY', '文件内容为空。');
    if (characterCount > MAX_PARSED_CODE_POINTS)
      throw this.reject('FILE_CONTENT_TOO_LARGE', '文件解析内容超过 40,000 字符限制。');
    return {
      ...prepared,
      normalizedContent,
      contentHash: sha256(Buffer.from(normalizedContent)),
      parserVersion: 'c1-b1-v1',
      pageCount,
      lineCount: normalizedContent ? normalizedContent.split('\n').length : 0,
      characterCount,
      overview,
      locations: locations ?? lineLocations(normalizedContent),
    };
  }

  // 校验图片尺寸并生成受限尺寸的 WebP 预览。
  private async processImage(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    mediaType: string,
  ): Promise<ParsedFile> {
    try {
      const sharp = (await import('sharp')).default;
      const image = sharp(file.buffer, { failOn: 'error', limitInputPixels: MAX_DECODED_PIXELS });
      const metadata = await image.metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;
      if (!width || !height || width * height > MAX_DECODED_PIXELS)
        throw this.reject('IMAGE_DIMENSIONS_INVALID', '图片尺寸超过处理限制。');
      const preview = await image
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      return {
        fileKind: 'image',
        mediaType,
        fileName: file.originalname,
        size: file.buffer.length,
        sha256: sha256(file.buffer),
        width,
        height,
        preview,
        previewType: 'image/webp',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw this.reject('IMAGE_DECODE_FAILED', '图片无法解码或处理失败。');
    }
  }

  private reject(code: string, detail: string): BadRequestException {
    return new BadRequestException({ code, detail });
  }
}

// 对浏览器常见的通用 MIME 按扩展名做有限归一化。
function normalizeMediaType(mediaType: string, name: string): string {
  if (mediaType === 'text/plain' && /\.md$/i.test(name)) return 'text/markdown';
  if (mediaType === 'application/octet-stream') {
    const ext = name.toLowerCase().split('.').pop();
    return (
      (
        {
          txt: 'text/plain',
          md: 'text/markdown',
          csv: 'text/csv',
          json: 'application/json',
          pdf: 'application/pdf',
        } as Record<string, string>
      )[ext ?? ''] ?? mediaType
    );
  }
  return mediaType;
}
function kindFor(mediaType: string): FileKind {
  return (
    {
      'text/plain': 'text',
      'text/markdown': 'markdown',
      'text/csv': 'csv',
      'application/json': 'json',
      'application/pdf': 'pdf',
    } as Record<string, FileKind>
  )[mediaType]!;
}
function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}
function decodeUtf8(buffer: Buffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
}
// 解析 MVP 范围内的 CSV，并要求所有记录列数一致。
function parseCsv(text: string): string[][] {
  const rows = text
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => {
      const cells: string[] = [];
      let cell = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i]!;
        if (c === '"') {
          if (quoted && line[i + 1] === '"') {
            cell += '"';
            i++;
          } else quoted = !quoted;
        } else if (c === ',' && !quoted) {
          cells.push(cell.trim());
          cell = '';
        } else cell += c;
      }
      if (quoted)
        throw new BadRequestException({
          code: 'FILE_PARSE_FAILED',
          detail: 'CSV 文件存在未闭合引号。',
        });
      cells.push(cell.trim());
      return cells;
    });
  const expected = rows[0]?.length ?? 0;
  if (!expected || rows.some((row) => row.length !== expected))
    throw new BadRequestException({
      code: 'FILE_PARSE_FAILED',
      detail: 'CSV 文件各行列数不一致。',
    });
  return rows;
}
// 为规范化文本生成从 1 开始的行号和字符偏移。
function lineLocations(text: string): ParsedFile['locations'] {
  const locations: NonNullable<ParsedFile['locations']> = [];
  let offset = 0;
  for (const [index, line] of text.split('\n').entries()) {
    locations.push({ startOffset: offset, endOffset: offset + line.length, line: index + 1 });
    offset += line.length + 1;
  }
  return locations;
}
// 校验具备稳定文件头的格式，降低伪造 MIME 风险。
function matchesMagic(buffer: Buffer, mediaType: string): boolean {
  if (mediaType === 'image/png')
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  if (mediaType === 'image/jpeg')
    return buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (mediaType === 'image/webp')
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  if (mediaType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  return true;
}
// 将解析超时转换为稳定的业务错误码。
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new BadRequestException({ code: 'FILE_PARSE_TIMEOUT', detail: '文件解析超时。' }),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
