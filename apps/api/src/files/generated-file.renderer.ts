import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import ExcelJS from 'exceljs';
import { chromium, type Browser, type Page } from 'playwright';
import unified from 'unified-c2';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import type { CreateFileInput } from '@harness/agent-protocol';
import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';

export type GeneratedFileKind = 'text' | 'markdown' | 'json' | 'html' | 'pdf' | 'docx' | 'xlsx';

export type RenderedGeneratedFile = {
  buffer: Buffer;
  mediaType: string;
  fileKind: GeneratedFileKind;
  normalizedContent: string;
};

type MarkdownNode = {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  lang?: string | null;
  ordered?: boolean | null;
  children?: MarkdownNode[];
};

const PDF_PAGE_CONCURRENCY = 2;
const PDF_FONT_STACK =
  '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif';
let browserPromise: Promise<Browser> | undefined;
let activePdfPages = 0;
const pdfWaiters: Array<() => void> = [];

export class GeneratedFileRenderError extends Error {
  constructor(
    readonly code: 'GENERATED_FILE_RENDER_FAILED' | 'GENERATED_FILE_RENDER_UNAVAILABLE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export async function renderGeneratedFile(
  input: CreateFileInput,
  signal?: AbortSignal,
): Promise<RenderedGeneratedFile> {
  throwIfAborted(signal);
  const extension = fileExtension(input.fileName);
  let result: RenderedGeneratedFile;
  if (extension === 'xlsx') {
    result = await renderXlsx(input, signal);
  } else {
    const content = input.content;
    if (!content)
      throw new GeneratedFileRenderError('GENERATED_FILE_RENDER_FAILED', '文件内容为空。');
    if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
      result = {
        buffer: Buffer.from(content, 'utf8'),
        mediaType: extension === 'txt' ? 'text/plain' : 'text/markdown',
        fileKind: extension === 'txt' ? 'text' : 'markdown',
        normalizedContent: content,
      };
    } else if (extension === 'json') {
      const normalizedContent = JSON.stringify(JSON.parse(content), null, 2);
      result = {
        buffer: Buffer.from(content, 'utf8'),
        mediaType: 'application/json',
        fileKind: 'json',
        normalizedContent,
      };
    } else if (extension === 'html') {
      const html = await markdownToHtml(content);
      result = {
        buffer: Buffer.from(html, 'utf8'),
        mediaType: 'text/html; charset=utf-8',
        fileKind: 'html',
        normalizedContent: content,
      };
    } else if (extension === 'pdf') {
      const html = await markdownToHtml(content);
      result = {
        buffer: await htmlToPdf(html, signal),
        mediaType: 'application/pdf',
        fileKind: 'pdf',
        normalizedContent: content,
      };
    } else if (extension === 'docx') {
      result = {
        buffer: await markdownToDocx(content, signal),
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileKind: 'docx',
        normalizedContent: content,
      };
    } else {
      throw new GeneratedFileRenderError('GENERATED_FILE_RENDER_FAILED', '不支持的生成文件类型。');
    }
  }
  throwIfAborted(signal);
  if (
    result.buffer.length === 0 ||
    result.buffer.length > AGENT_PROTOCOL_LIMITS.generatedFileMaxBytes
  ) {
    throw new GeneratedFileRenderError(
      'GENERATED_FILE_RENDER_FAILED',
      '生成结果为空或超过 10 MB 限制。',
    );
  }
  validateSignature(result);
  return result;
}

export async function closeGeneratedFileRenderer(): Promise<void> {
  const current = browserPromise;
  browserPromise = undefined;
  if (current) await (await current).close();
}

async function parseMarkdown(content: string): Promise<MarkdownNode> {
  const tree = unified()
    .use(remarkParse as never)
    .use(remarkGfm as never)
    .parse(content) as MarkdownNode;
  validateMarkdownTree(tree);
  return tree;
}

async function markdownToHtml(content: string): Promise<string> {
  const tree = await parseMarkdown(content);
  const processor = unified()
    .use(remarkRehype as never, { allowDangerousHtml: false })
    .use(rehypeStringify as never);
  const body = processor.stringify(await processor.run(tree));
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Generated document</title><style>${documentCss()}</style></head><body><main>${body}</main></body></html>`;
}

function validateMarkdownTree(node: MarkdownNode): void {
  if (node.type === 'html' || node.type === 'image' || node.type === 'imageReference') {
    throw new GeneratedFileRenderError(
      'GENERATED_FILE_RENDER_FAILED',
      'Markdown 不支持原始 HTML 或图片。',
    );
  }
  if (node.type === 'math' || node.type === 'inlineMath') {
    throw new GeneratedFileRenderError('GENERATED_FILE_RENDER_FAILED', 'Markdown 不支持数学公式。');
  }
  if (node.type === 'code' && /^(?:mermaid|svg)$/iu.test(node.lang ?? '')) {
    throw new GeneratedFileRenderError(
      'GENERATED_FILE_RENDER_FAILED',
      'Markdown 不支持 Mermaid 或 SVG。',
    );
  }
  if (node.type === 'link' && node.url && !/^https:\/\//iu.test(node.url)) {
    throw new GeneratedFileRenderError(
      'GENERATED_FILE_RENDER_FAILED',
      'Markdown 链接仅支持 https:// 地址。',
    );
  }
  for (const child of node.children ?? []) validateMarkdownTree(child);
}

function documentCss(): string {
  return `
@page { size: A4 portrait; margin: 18mm 16mm; }
* { box-sizing: border-box; }
html { color: #172033; background: #fff; font-family: ${PDF_FONT_STACK}; }
body { margin: 0; font-size: 14px; line-height: 1.68; }
main { max-width: 850px; margin: 0 auto; }
h1,h2,h3 { line-height: 1.3; break-after: avoid; color: #111827; }
h1 { font-size: 28px; } h2 { font-size: 22px; margin-top: 1.4em; } h3 { font-size: 17px; }
a { color: #155eef; overflow-wrap: anywhere; }
blockquote { margin: 1em 0; padding: .15em 1em; color: #475467; border-left: 4px solid #cbd5e1; }
pre,code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px 14px; background: #f4f6f8; border-radius: 6px; }
code { background: #f4f6f8; padding: .1em .3em; border-radius: 3px; }
pre code { padding: 0; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; break-inside: auto; }
th,td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
th { background: #f1f5f9; } tr { break-inside: avoid; }
hr { border: 0; border-top: 1px solid #cbd5e1; margin: 1.5em 0; }
`;
}

async function htmlToPdf(html: string, signal?: AbortSignal): Promise<Buffer> {
  const release = await acquirePdfSlot(signal);
  let page: Page | undefined;
  const abort = () => void page?.close().catch(() => undefined);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const browser = await getPdfBrowser();
    throwIfAborted(signal);
    page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load', timeout: 10_000 });
    throwIfAborted(signal);
    return Buffer.from(
      await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
      }),
    );
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (isBrowserUnavailable(error)) {
      browserPromise = undefined;
      throw new GeneratedFileRenderError(
        'GENERATED_FILE_RENDER_UNAVAILABLE',
        'PDF 渲染所需的 Chromium 不可用。',
        { cause: error },
      );
    }
    throw new GeneratedFileRenderError('GENERATED_FILE_RENDER_FAILED', 'PDF 渲染失败。', {
      cause: error,
    });
  } finally {
    signal?.removeEventListener('abort', abort);
    await page?.close().catch(() => undefined);
    release();
  }
}

async function getPdfBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ headless: true }).then((browser) => {
    browser.on('disconnected', () => {
      browserPromise = undefined;
    });
    return browser;
  });
  return browserPromise;
}

async function acquirePdfSlot(signal?: AbortSignal): Promise<() => void> {
  while (activePdfPages >= PDF_PAGE_CONCURRENCY) {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        const index = pdfWaiters.indexOf(wake);
        if (index >= 0) pdfWaiters.splice(index, 1);
        reject(abortError());
      };
      const wake = () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      signal?.addEventListener('abort', abort, { once: true });
      pdfWaiters.push(wake);
    });
  }
  throwIfAborted(signal);
  activePdfPages++;
  return () => {
    activePdfPages--;
    pdfWaiters.shift()?.();
  };
}

async function markdownToDocx(content: string, signal?: AbortSignal): Promise<Buffer> {
  const tree = await parseMarkdown(content);
  throwIfAborted(signal);
  const children = markdownBlocks(tree.children ?? []);
  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Microsoft YaHei', size: 22 },
          paragraph: { spacing: { after: 160, line: 340 } },
        },
        heading1: { run: { font: 'Microsoft YaHei', size: 34, bold: true } },
        heading2: { run: { font: 'Microsoft YaHei', size: 29, bold: true } },
        heading3: { run: { font: 'Microsoft YaHei', size: 25, bold: true } },
      },
    },
    numbering: {
      config: [
        {
          reference: 'generated-numbering',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1021, right: 907, bottom: 1021, left: 907 },
          },
        },
        children,
      },
    ],
  });
  const buffer = await Packer.toBuffer(document);
  throwIfAborted(signal);
  return buffer;
}

function markdownHeadingLevel(depth: number) {
  if (depth === 1) return HeadingLevel.HEADING_1;
  if (depth === 2) return HeadingLevel.HEADING_2;
  return HeadingLevel.HEADING_3;
}

function markdownBlocks(nodes: MarkdownNode[]): Array<Paragraph | Table> {
  const result: Array<Paragraph | Table> = [];
  for (const node of nodes) {
    if (node.type === 'heading') {
      const heading = markdownHeadingLevel(node.depth ?? 3);
      result.push(new Paragraph({ heading, children: inlineChildren(node.children ?? []) }));
    } else if (node.type === 'paragraph') {
      result.push(new Paragraph({ children: inlineChildren(node.children ?? []) }));
    } else if (node.type === 'code') {
      result.push(
        new Paragraph({
          shading: { fill: 'F4F6F8' },
          children: [new TextRun({ text: node.value ?? '', font: 'Consolas', size: 19 })],
        }),
      );
    } else if (node.type === 'blockquote') {
      result.push(
        new Paragraph({
          children: [new TextRun({ text: plainText(node), italics: true, color: '475467' })],
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CBD5E1' } },
        }),
      );
    } else if (node.type === 'list') {
      for (const item of node.children ?? []) {
        const itemNodes = item.children ?? [];
        const first = itemNodes[0];
        result.push(
          new Paragraph({
            children: inlineChildren(first?.children ?? []),
            ...(node.ordered
              ? { numbering: { reference: 'generated-numbering', level: 0 } }
              : { bullet: { level: 0 } }),
          }),
        );
        result.push(...markdownBlocks(itemNodes.slice(1)));
      }
    } else if (node.type === 'table') {
      result.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: (node.children ?? []).map(
            (row, rowIndex) =>
              new TableRow({
                children: (row.children ?? []).map(
                  (cell) =>
                    new TableCell({
                      shading: rowIndex === 0 ? { fill: 'F1F5F9' } : undefined,
                      children: [
                        new Paragraph({
                          children: inlineChildren(cell.children ?? [], rowIndex === 0),
                        }),
                      ],
                    }),
                ),
              }),
          ),
        }),
      );
    } else if (node.type === 'thematicBreak') {
      result.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' } },
        }),
      );
    }
  }
  return result;
}

function inlineChildren(nodes: MarkdownNode[], inheritedBold = false): ParagraphChild[] {
  const result: ParagraphChild[] = [];
  const walk = (
    node: MarkdownNode,
    style: { bold?: boolean; italics?: boolean; strike?: boolean } = {},
  ) => {
    const merged = { ...style, ...(inheritedBold ? { bold: true } : {}) };
    if (node.type === 'text') result.push(new TextRun({ text: node.value ?? '', ...merged }));
    else if (node.type === 'inlineCode')
      result.push(
        new TextRun({
          text: node.value ?? '',
          font: 'Consolas',
          shading: { fill: 'F4F6F8' },
          ...merged,
        }),
      );
    else if (node.type === 'break') result.push(new TextRun({ break: 1 }));
    else if (node.type === 'strong')
      for (const child of node.children ?? []) walk(child, { ...merged, bold: true });
    else if (node.type === 'emphasis')
      for (const child of node.children ?? []) walk(child, { ...merged, italics: true });
    else if (node.type === 'delete')
      for (const child of node.children ?? []) walk(child, { ...merged, strike: true });
    else if (node.type === 'link') {
      const linkChildren = inlineChildren(node.children ?? [], inheritedBold);
      result.push(
        new ExternalHyperlink({
          link: node.url!,
          children: linkChildren.filter((child): child is TextRun => child instanceof TextRun),
        }),
      );
    } else for (const child of node.children ?? []) walk(child, merged);
  };
  for (const node of nodes) walk(node);
  return result;
}

function plainText(node: MarkdownNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(plainText).join('');
}

async function renderXlsx(
  input: CreateFileInput,
  signal?: AbortSignal,
): Promise<RenderedGeneratedFile> {
  if (!input.sheets?.length)
    throw new GeneratedFileRenderError('GENERATED_FILE_RENDER_FAILED', 'XLSX 缺少工作表数据。');
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set<string>();
  const normalized: string[] = [];
  input.sheets.forEach((source, sheetIndex) => {
    throwIfAborted(signal);
    const name = uniqueSheetName(source.name, sheetIndex, usedNames);
    const sheet = workbook.addWorksheet(name);
    source.rows.forEach((row) => sheet.addRow(row));
    if (sheet.rowCount > 0) {
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.getRow(1).font = { bold: true };
      const columnCount = Math.max(0, ...source.rows.map((row) => row.length));
      if (columnCount > 0) {
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnCount } };
        for (let column = 1; column <= columnCount; column++) {
          const width = Math.max(
            10,
            ...source.rows.map((row) => displayCell(row[column - 1]).length + 2),
          );
          sheet.getColumn(column).width = Math.min(50, width);
        }
      }
    }
    normalized.push(normalizedSheet(name, source.rows));
  });
  const raw = await workbook.xlsx.writeBuffer();
  throwIfAborted(signal);
  return {
    buffer: Buffer.from(raw),
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileKind: 'xlsx',
    normalizedContent: normalized.join('\n\n'),
  };
}

function uniqueSheetName(source: string, index: number, used: Set<string>): string {
  const cleaned = [...source.replace(/[\\/?*[\]:]/gu, '').trim()].slice(0, 31).join('');
  const base = cleaned || `Sheet${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase())) {
    const marker = ` (${suffix++})`;
    candidate = [...base].slice(0, 31 - [...marker].length).join('') + marker;
  }
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

function normalizedSheet(
  name: string,
  rows: Array<Array<string | number | boolean | null>>,
): string {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const matrix = rows.length ? rows : [[]];
  const lines = matrix.map(
    (row) =>
      `| ${Array.from({ length: width }, (_, index) => escapeTableCell(row[index])).join(' | ')} |`,
  );
  lines.splice(1, 0, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`);
  return `[Sheet: ${name}]\n\n${lines.join('\n')}`;
}

function escapeTableCell(value: string | number | boolean | null | undefined): string {
  return displayCell(value)
    .replace(/\\/gu, '\\\\')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, '<br>');
}

function displayCell(value: string | number | boolean | null | undefined): string {
  return value == null ? '' : String(value);
}

function fileExtension(fileName: string): string {
  return fileName.trim().toLowerCase().split('.').pop() ?? '';
}

function validateSignature(result: RenderedGeneratedFile): void {
  if (result.fileKind === 'pdf' && !result.buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new GeneratedFileRenderError('GENERATED_FILE_RENDER_FAILED', 'PDF 文件头无效。');
  if (
    (result.fileKind === 'docx' || result.fileKind === 'xlsx') &&
    !result.buffer.subarray(0, 2).equals(Buffer.from('PK'))
  )
    throw new GeneratedFileRenderError('GENERATED_FILE_RENDER_FAILED', 'Office 文件头无效。');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function isBrowserUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /executable|chromium|browser.*closed|failed to launch|missing dependencies|ENOENT/iu.test(
    message,
  );
}
