import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { WEB_FETCH_POLICY } from './web-fetch.constants';
import { WebFetchError } from './web-fetch.error';
import type {
  ExtractedWebContent,
  FetchedWebContent,
  NormalizedDocumentBlock,
  NormalizedWebDocument,
} from './web-fetch.types';
import { codePointIndexOf, codePointLength, sliceCodePoints } from './unicode.utils';

@Injectable()
export class DocumentNormalizer {
  // 把提取结果转换为 Hash、Passage 和 Locator 共用的 canonical Markdown。
  normalize(input: {
    fetched: FetchedWebContent;
    extracted: ExtractedWebContent;
    normalizedUrl: string;
  }): NormalizedWebDocument {
    const cleaned = this.cleanMarkdown(input.extracted.markdown);
    if (!cleaned) {
      throw new WebFetchError(AGENT_ERROR_CODES.fetchContentEmpty, '网页中没有可用正文。');
    }
    const truncated = codePointLength(cleaned) > WEB_FETCH_POLICY.maxDocumentCharacters;
    const markdown = truncated
      ? sliceCodePoints(cleaned, 0, WEB_FETCH_POLICY.maxDocumentCharacters).trimEnd()
      : cleaned;
    const contentHash = createHash('sha256').update(markdown, 'utf8').digest('hex');
    const blocks = this.scanBlocks(markdown);
    if (!blocks.length) {
      throw new WebFetchError(AGENT_ERROR_CODES.fetchContentEmpty, '网页中没有可用正文。');
    }
    return {
      requestedUrl: input.fetched.requestedUrl,
      finalUrl: input.fetched.finalUrl,
      normalizedUrl: input.normalizedUrl,
      title: input.extracted.title ?? new URL(input.fetched.finalUrl).hostname,
      ...(input.extracted.author ? { author: input.extracted.author } : {}),
      ...(input.extracted.publishedAt ? { publishedAt: input.extracted.publishedAt } : {}),
      ...(input.extracted.language ? { language: input.extracted.language } : {}),
      contentType: input.fetched.contentType,
      retrievedAt: input.fetched.retrievedAt,
      contentHash,
      truncated,
      markdown,
      blocks,
    };
  }

  // 规范化控制字符、换行和多余空白，同时保留 Markdown 结构。
  private cleanMarkdown(value: string): string {
    const withoutControls = Array.from(value)
      .filter((character) => {
        const code = character.codePointAt(0) ?? 0;
        return character === '\n' || character === '\r' || character === '\t' ||
          (code >= 32 && code !== 127);
      })
      .join('');
    return withoutControls
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // 扫描 Markdown 标题与空行边界，生成具有稳定 code-point 位置的结构块。
  private scanBlocks(markdown: string): NormalizedDocumentBlock[] {
    const blocks: NormalizedDocumentBlock[] = [];
    const sectionPath: string[] = [];
    const parts = markdown.split(/\n{2,}/);
    let cursor = 0;
    for (const part of parts) {
      const text = part.trim();
      if (!text) continue;
      const start = codePointIndexOf(markdown, text, cursor);
      if (start < 0) continue;
      const heading = /^(#{1,6})\s+(.+)$/m.exec(text);
      if (heading && heading.index === 0) {
        const level = heading[1]?.length ?? 1;
        sectionPath.splice(level - 1);
        sectionPath[level - 1] = heading[2]?.trim() ?? '';
      }
      // 标题可能从二级或更深层级开始，过滤稀疏层级避免 JSON 序列化出 null。
      const normalizedSectionPath = sectionPath.filter((item): item is string => Boolean(item));
      const end = start + codePointLength(text);
      blocks.push({
        text,
        start,
        end,
        sectionPath: normalizedSectionPath,
        order: blocks.length,
      });
      cursor = end;
    }
    return blocks;
  }
}
