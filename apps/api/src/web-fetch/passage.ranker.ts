import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';
import type { WebFetchPassage } from '@harness/agent-protocol';
import { WEB_FETCH_POLICY } from './web-fetch.constants';
import type {
  NormalizedDocumentBlock,
  NormalizedWebDocument,
  RankedWebPassage,
} from './web-fetch.types';
import { codePointLength, sliceCodePoints } from './unicode.utils';

@Injectable()
export class PassageRanker {
  // 按 query 相关性或代表性优先级选择单份文档的有界原文片段。
  rank(
    document: NormalizedWebDocument,
    blocks: NormalizedDocumentBlock[],
    query: string | undefined,
    documentIndex: number,
  ): RankedWebPassage[] {
    const scored = blocks.map((block, passageIndex) => ({
      block,
      passageIndex,
      score: query ? this.relevance(query, block, blocks.length) : this.representative(block),
    }));
    const eligible = query
      ? scored.filter((item) => item.score >= WEB_FETCH_POLICY.minimumRelevanceScore)
      : scored;
    return eligible
      .sort((left, right) => right.score - left.score || left.block.start - right.block.start)
      .slice(0, AGENT_PROTOCOL_LIMITS.webFetchPassagesMax)
      .map((item) => ({
        passage: this.toPassage(document, item.block),
        score: item.score,
        documentIndex,
        passageIndex: item.passageIndex,
      }));
  }

  // 使用字符 2-gram/3-gram overlap、标题加权和位置加权计算轻量相关性。
  private relevance(query: string, block: NormalizedDocumentBlock, totalBlocks: number): number {
    const normalizedQuery = this.normalizeForNgrams(query);
    const normalizedText = this.normalizeForNgrams(block.text);
    const normalizedHeading = this.normalizeForNgrams(block.sectionPath.join(' '));
    const queryGrams = this.ngrams(normalizedQuery);
    if (!queryGrams.size) return 0;
    const bodyScore = this.overlap(queryGrams, this.ngrams(normalizedText));
    const headingScore = this.overlap(queryGrams, this.ngrams(normalizedHeading));
    if (bodyScore === 0 && headingScore === 0) return 0;
    const positionBonus = Math.max(0, 1 - block.order / Math.max(1, totalBlocks)) * 0.04;
    const repetitionPenalty = /(.)\1{8,}/u.test(block.text) ? 0.1 : 0;
    return bodyScore + headingScore * 0.45 + positionBonus - repetitionPenalty;
  }

  // query 缺失时让开头和标题下正文具有稳定的代表性优先级。
  private representative(block: NormalizedDocumentBlock): number {
    const headingBonus = block.sectionPath.length ? 0.25 : 0;
    return 1 / (1 + block.order) + headingBonus;
  }

  // 将文本归一化为适合中英文混合字符 n-gram 的形式。
  private normalizeForNgrams(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[\s\p{P}\p{S}]+/gu, '');
  }

  // 同时生成字符 2-gram 和 3-gram 集合。
  private ngrams(value: string): Set<string> {
    const points = Array.from(value);
    const grams = new Set<string>();
    for (const size of [2, 3]) {
      for (let index = 0; index <= points.length - size; index += 1) {
        grams.add(points.slice(index, index + size).join(''));
      }
    }
    if (!grams.size && value) grams.add(value);
    return grams;
  }

  // 计算 query n-gram 被候选文本覆盖的比例。
  private overlap(query: Set<string>, target: Set<string>): number {
    let hits = 0;
    for (const gram of query) if (target.has(gram)) hits += 1;
    return hits / Math.max(1, query.size);
  }

  // 生成绑定内容 Hash 和 code-point 位置的稳定 Passage 与 Locator。
  private toPassage(
    document: NormalizedWebDocument,
    block: NormalizedDocumentBlock,
  ): WebFetchPassage {
    const context = WEB_FETCH_POLICY.locatorContextCharacters;
    const passageId = createHash('sha256')
      .update(`${document.contentHash}:${block.start}:${block.end}`)
      .digest('hex')
      .slice(0, 24);
    const prefix = sliceCodePoints(
      document.markdown,
      Math.max(0, block.start - context),
      block.start,
    );
    const suffix = sliceCodePoints(document.markdown, block.end, block.end + context);
    return {
      passageId,
      text: block.text,
      locator: {
        kind: 'web_text',
        quote: {
          exact: block.text,
          ...(prefix ? { prefix } : {}),
          ...(suffix ? { suffix } : {}),
        },
        position: { start: block.start, end: block.start + codePointLength(block.text) },
        ...(block.sectionPath.length ? { sectionPath: block.sectionPath } : {}),
      },
    };
  }
}
