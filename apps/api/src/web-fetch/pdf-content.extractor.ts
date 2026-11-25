import { Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { PDFParse } from 'pdf-parse';
import { WEB_FETCH_POLICY } from './web-fetch.constants';
import { WebFetchError } from './web-fetch.error';
import type { ExtractedWebContent } from './web-fetch.types';
import { codePointLength } from './unicode.utils';

// 校验字节流是否以标准 PDF 文件头开头，避免将非 PDF 二进制流送入解析器。
export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.byteLength >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

@Injectable()
export class PdfContentExtractor {
  // 进程内串行化 PDF 解析，避免并发大图/复杂页面阻塞单线程事件循环或拉高堆内存。
  private queue: Promise<void> = Promise.resolve();

  // 解析在线 PDF 字节流为受控分页 Markdown，并保留截断与元信息。
  async extract(buffer: Buffer, finalUrl: string, signal?: AbortSignal): Promise<ExtractedWebContent> {
    if (signal?.aborted) {
      throw new WebFetchError(AGENT_ERROR_CODES.fetchCancelled, '网页读取已取消。');
    }
    if (!isPdfBuffer(buffer)) {
      throw new WebFetchError(
        AGENT_ERROR_CODES.fetchUnsupportedContentType,
        '网页响应不是有效的 PDF 文档。',
      );
    }
    return this.enqueue(async () => {
      if (signal?.aborted) {
        throw new WebFetchError(AGENT_ERROR_CODES.fetchCancelled, '网页读取已取消。');
      }
      return this.parseWithTimeout(buffer, finalUrl, signal);
    });
  }

  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
    }
  }

  private async parseWithTimeout(
    buffer: Buffer,
    finalUrl: string,
    signal?: AbortSignal,
  ): Promise<ExtractedWebContent> {
    const parser = new PDFParse({ data: buffer });
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;

    const parsePromise = (async (): Promise<ExtractedWebContent> => {
      const info = await parser.getInfo();
      const totalPages = info.total;
      const pageLimit = Math.min(totalPages, WEB_FETCH_POLICY.maxPdfPages);
      let truncated = totalPages > WEB_FETCH_POLICY.maxPdfPages;

      const textResult =
        pageLimit > 0
          ? await parser.getText(totalPages > pageLimit ? { first: pageLimit } : undefined)
          : { pages: [] };

      const chunks: string[] = [];
      let totalCodePoints = 0;
      for (const page of textResult.pages) {
        const pageText = page.text.trim();
        if (!pageText) continue;
        const chunk = `[[page:${page.num}]]\n${pageText}`;
        const chunkLength = codePointLength(chunk);
        const separatorLength = chunks.length > 0 ? 2 : 0;
        if (
          chunks.length > 0 &&
          totalCodePoints + separatorLength + chunkLength > WEB_FETCH_POLICY.maxDocumentCharacters
        ) {
          truncated = true;
          break;
        }
        chunks.push(chunk);
        totalCodePoints += separatorLength + chunkLength;
        if (totalCodePoints >= WEB_FETCH_POLICY.maxDocumentCharacters) {
          if (page.num < totalPages) truncated = true;
          break;
        }
      }

      if (!chunks.length) {
        throw new WebFetchError(
          AGENT_ERROR_CODES.fetchContentEmpty,
          'PDF 不包含可提取文本（可能是扫描件）。',
        );
      }

      const rawTitle = this.readInfoString(info.info, 'Title');
      const author = this.readInfoString(info.info, 'Author');
      return {
        markdown: chunks.join('\n\n'),
        title: rawTitle ?? this.fallbackTitleFromUrl(finalUrl),
        ...(author ? { author } : {}),
        ...(truncated ? { truncated: true } : {}),
      };
    })();

    const guardPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new WebFetchError(AGENT_ERROR_CODES.fetchTimeout, 'PDF 解析超时。', true));
      }, WEB_FETCH_POLICY.pdfParseTimeoutMs);
      if (signal) {
        onAbort = () => {
          reject(new WebFetchError(AGENT_ERROR_CODES.fetchCancelled, '网页读取已取消。'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });

    try {
      return await Promise.race([parsePromise, guardPromise]);
    } catch (error) {
      if (error instanceof WebFetchError) throw error;
      if (signal?.aborted) {
        throw new WebFetchError(AGENT_ERROR_CODES.fetchCancelled, '网页读取已取消。');
      }
      throw new WebFetchError(
        AGENT_ERROR_CODES.fetchContentExtractionFailed,
        'PDF 正文解析失败。',
        false,
        error,
      );
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      await parser.destroy().catch(() => undefined);
    }
  }

  private readInfoString(info: unknown, key: string): string | undefined {
    if (typeof info !== 'object' || info === null) return undefined;
    const value = (info as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private fallbackTitleFromUrl(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);
      const lastSegment = url.pathname.split('/').filter(Boolean).pop();
      if (lastSegment) {
        const decoded = decodeURIComponent(lastSegment).replace(/\.pdf$/iu, '').trim();
        if (decoded) return decoded;
      }
      return url.hostname;
    } catch {
      return 'PDF Document';
    }
  }
}
