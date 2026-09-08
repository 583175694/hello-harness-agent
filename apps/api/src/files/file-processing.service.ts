import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { OfficeParser } from 'officeparser';
import { createHash } from 'node:crypto';

// C1 文件大小、会话容量、正文字符数和 PDF 页数上限。
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SESSION_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_PARSED_CODE_POINTS = 40_000;
export const MAX_PDF_PAGES = 200;
// 单个文件解析任务的最长执行时间。
export const FILE_PARSE_TIMEOUT_MS = 30_000;
// 支持的图片 MIME 类型。
export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
// 支持解析为规范化正文的文档 MIME 类型。
export const ALLOWED_DOCUMENT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
// 防止压缩图片解码后占用过多内存。
const MAX_DECODED_PIXELS = 40_000_000;

type FileKind = 'image' | 'text' | 'markdown' | 'csv' | 'json' | 'pdf' | 'docx' | 'xlsx' | 'pptx';
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
    // Busboy 默认按 latin1 读取 multipart 文件名；浏览器上传中文名时先恢复 UTF-8。
    const normalizedFile = { ...file, originalname: decodeMultipartFileName(file.originalname) };
    if (file.buffer.length === 0) throw this.reject('FILE_EMPTY', '文件为空。');
    if (file.buffer.length > MAX_FILE_BYTES)
      throw this.reject('FILE_TOO_LARGE', '文件超过 20 MiB 限制。');
    // 统一浏览器传入的 MIME，后续校验都使用归一化结果。
    const mediaType = normalizeMediaType(normalizedFile.mimetype, normalizedFile.originalname);
    if (!ALLOWED_IMAGE_TYPES.has(mediaType) && !ALLOWED_DOCUMENT_TYPES.has(mediaType))
      throw this.reject(
        'FILE_TYPE_UNSUPPORTED',
        '仅支持图片、TXT、Markdown、CSV、JSON、PDF、DOCX、XLSX 和 PPTX 文件。',
      );
    if (!matchesMagic(file.buffer, mediaType))
      throw this.reject('FILE_SIGNATURE_MISMATCH', '文件类型与实际内容不一致。');
    if (ALLOWED_IMAGE_TYPES.has(mediaType)) return this.processImage(normalizedFile, mediaType);
    return {
      fileKind: kindFor(mediaType),
      mediaType,
      fileName: normalizedFile.originalname,
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
    // normalizedContent 是搜索和按行读取的唯一正文来源。
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
    } else if (isOfficeKind(prepared.fileKind)) {
      try {
        const ast = await OfficeParser.parseOffice(buffer, {
          fileType: prepared.fileKind,
          extractAttachments: false,
          ocr: false,
        });
        const markdown = (await ast.to('md')).value;
        overview = officeOverview(ast, prepared.fileKind);
        const sheetLabels = Array.isArray(overview.sheets)
          ? overview.sheets.filter((value): value is string => typeof value === 'string')
          : [];
        normalizedContent = officeMarkdownWithBoundaries(markdown, prepared.fileKind, sheetLabels);
      } catch (error) {
        throw this.reject('FILE_PARSE_FAILED', 'Office 文件解析失败。');
      }
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
      parserVersion: 'c1-b2-v1',
      pageCount,
      lineCount: normalizedContent ? normalizedContent.split('\n').length : 0,
      characterCount,
      overview,
      locations: locations ?? lineLocations(normalizedContent),
    };
  }

  // 校验图片尺寸并生成受限尺寸的 WebP 预览。
  // 解码图片、校验尺寸并生成供前端预览的 WebP 缩略图。
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

  // 创建带稳定错误码和用户提示的上传或解析异常。
  private reject(code: string, detail: string): BadRequestException {
    return new BadRequestException({ code, detail });
  }
}

// 对浏览器常见的通用 MIME 按扩展名做有限归一化。
// 根据 MIME 和扩展名有限归一化文件类型，兼容浏览器常见上传结果。
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
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        } as Record<string, string>
      )[ext ?? ''] ?? mediaType
    );
  }
  return mediaType;
}
// 将规范化 MIME 映射到协议使用的文件种类。
function kindFor(mediaType: string): FileKind {
  return (
    {
      'text/plain': 'text',
      'text/markdown': 'markdown',
      'text/csv': 'csv',
      'application/json': 'json',
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    } as Record<string, FileKind>
  )[mediaType]!;
}
// 计算原文件或规范化正文的内容哈希。
function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}
// 使用容错 UTF-8 解码文本，并移除文件开头的 BOM。
function decodeUtf8(buffer: Buffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
}
// 仅在出现典型 UTF-8 被误读为 latin1 的痕迹时转换，避免破坏本来就是 Unicode 的文件名。
function decodeMultipartFileName(name: string): string {
  if (!/[ÃÂÐÑæåäöü]|�/u.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}
// 解析 MVP 范围内的 CSV，并要求所有记录列数一致。
function parseCsv(text: string): string[][] {
  // 逐行解析 MVP 支持的 CSV 语法，并在最后统一校验列数。
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
// 校验图片和 PDF 的文件头，避免只依赖客户端声明的 MIME。
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
  if (mediaType.startsWith('application/vnd.openxmlformats-officedocument.'))
    return (
      buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    );
  return true;
}

function isOfficeKind(kind: FileKind): kind is 'docx' | 'xlsx' | 'pptx' {
  return kind === 'docx' || kind === 'xlsx' || kind === 'pptx';
}

function officeMarkdownWithBoundaries(
  markdown: string,
  kind: 'docx' | 'xlsx' | 'pptx',
  labels: string[] = [],
): string {
  const normalized = markdown.trim();
  if (kind === 'xlsx' || kind === 'pptx') {
    const sections = normalized
      .split(/\n---\n+/)
      .map((section) => section.trim())
      .filter(Boolean);
    return sections
      .map((section, index) => {
        const label =
          kind === 'xlsx'
            ? `[Sheet: ${labels[index] ?? `Sheet${index + 1}`}]`
            : `[Slide ${index + 1}]`;
        return `${label}\n\n${section}`;
      })
      .join('\n\n');
  }
  return normalized;
}

function officeOverview(
  ast: { content?: Array<{ type?: string; metadata?: unknown }> },
  kind: 'docx' | 'xlsx' | 'pptx',
) {
  const content = ast.content ?? [];
  const overview: Record<string, unknown> = { format: kind };
  if (kind === 'xlsx') {
    const sheets = content.filter((node) => node.type === 'sheet');
    overview.sheetCount = sheets.length;
    overview.sheets = sheets
      .map((sheet) => {
        const metadata = sheet.metadata as { name?: unknown; sheetName?: unknown } | undefined;
        const name = metadata?.sheetName ?? metadata?.name;
        return typeof name === 'string' ? name : undefined;
      })
      .filter(Boolean);
  } else if (kind === 'pptx') {
    overview.slideCount = content.filter((node) => node.type === 'slide').length;
  } else {
    overview.paragraphCount = content.filter(
      (node) => node.type === 'paragraph' || node.type === 'heading',
    ).length;
    overview.tableCount = content.filter((node) => node.type === 'table').length;
  }
  return overview;
}
// 将解析超时转换为稳定的业务错误码。
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  // 将底层解析超时转换为稳定的业务错误，并清理定时器。
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
