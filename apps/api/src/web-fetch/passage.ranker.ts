import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';
import type { WebFetchPassage } from '@harness/agent-protocol';
import { WEB_FETCH_POLICY } from './web-fetch.constants';
import type {
  NormalizedDocumentBlock,
  NormalizedWebDocument,
  RankedDocumentPassages,
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

  // 在相关性匹配为空且属于跨语种查询时，降级返回有限的代表性片段，避免误丢整页。
  rankForFetch(
    document: NormalizedWebDocument,
    blocks: NormalizedDocumentBlock[],
    query: string | undefined,
    documentIndex: number,
  ): RankedDocumentPassages {
    if (!query) {
      return {
        passages: this.rank(document, blocks, undefined, documentIndex),
        passageSelection: 'representative',
      };
    }
    const matched = this.rank(document, blocks, query, documentIndex);
    if (matched.length > 0) {
      return { passages: matched, passageSelection: 'query_matched' };
    }
    if (
      document.contentType !== 'application/json' &&
      !this.isCrossScriptQuery(query, document.markdown)
    ) {
      return { passages: [], passageSelection: 'query_matched' };
    }
    const fallback = blocks
      .map((block, passageIndex) => ({
        block,
        passageIndex,
        representativeScore: this.representative(block),
      }))
      .sort(
        (left, right) =>
          right.representativeScore - left.representativeScore ||
          left.block.start - right.block.start,
      )
      .slice(0, WEB_FETCH_POLICY.fallbackExcerptMaxPassages)
      .map((item) => ({
        passage: this.toPassage(document, item.block),
        score: WEB_FETCH_POLICY.fallbackExcerptScore,
        documentIndex,
        passageIndex: item.passageIndex,
      }));
    return { passages: fallback, passageSelection: 'fallback_excerpt' };
  }

  // 使用字符 2-gram/3-gram overlap、拉丁词元精确匹配、标题加权和位置加权计算相关性。
  private relevance(query: string, block: NormalizedDocumentBlock, totalBlocks: number): number {
    const normalizedQuery = this.normalizeForNgrams(query);
    const normalizedText = this.normalizeForNgrams(block.text);
    const normalizedHeading = this.normalizeForNgrams(block.sectionPath.join(' '));
    const queryGrams = this.ngrams(normalizedQuery);
    const latinTokens = this.extractLatinTokens(query);
    if (!queryGrams.size && !latinTokens.length) return 0;

    const ngramBodyScore = queryGrams.size ? this.overlap(queryGrams, this.ngrams(normalizedText)) : 0;
    const ngramHeadingScore = queryGrams.size
      ? this.overlap(queryGrams, this.ngrams(normalizedHeading))
      : 0;
    const tokenBodyScore = latinTokens.length
      ? this.latinTokenOverlap(latinTokens, block.text)
      : 0;
    const tokenHeadingScore = latinTokens.length
      ? this.latinTokenOverlap(latinTokens, block.sectionPath.join(' '))
      : 0;
    const queryTerms = this.extractQueryTerms(query);
    const termBodyScore = queryTerms.length ? this.queryTermOverlap(queryTerms, block.text) : 0;
    const termHeadingScore = queryTerms.length
      ? this.queryTermOverlap(queryTerms, block.sectionPath.join(' '))
      : 0;

    const bodyScore = Math.max(ngramBodyScore, tokenBodyScore * 0.85, termBodyScore * 0.85);
    const headingScore = Math.max(
      ngramHeadingScore,
      tokenHeadingScore * 0.85,
      termHeadingScore * 0.85,
    );
    if (bodyScore === 0 && headingScore === 0) return 0;
    const positionBonus = Math.max(0, 1 - block.order / Math.max(1, totalBlocks)) * 0.04;
    const repetitionPenalty = /(.)\1{8,}/u.test(block.text) ? 0.1 : 0;
    return bodyScore + headingScore * 0.45 + positionBonus - repetitionPenalty;
  }

  private extractQueryTerms(value: string): string[] {
    const terms = value
      .toLowerCase()
      .normalize('NFKC')
      .split(/[\s\p{P}\p{S}]+/gu)
      .map((term) => term.trim())
      .filter((term) => codePointLength(term) >= 2);
    return [...new Set(terms)];
  }

  private queryTermOverlap(terms: string[], text: string): number {
    if (!terms.length || !text) return 0;
    const lowered = text.toLowerCase().normalize('NFKC');
    let hits = 0;
    for (const term of terms) {
      if (lowered.includes(term)) hits += 1;
    }
    return hits / terms.length;
  }

  private extractLatinTokens(value: string): string[] {
    const matches = value.toLowerCase().match(/[a-z0-9][a-z0-9._+-]{1,}/gu) ?? [];
    return [...new Set(matches)];
  }

  private latinTokenOverlap(tokens: string[], text: string): number {
    if (!tokens.length || !text) return 0;
    const lowered = text.toLowerCase();
    let hits = 0;
    for (const token of tokens) {
      if (token.length <= 3) {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'iu').test(lowered)) {
          hits += 1;
        }
      } else if (lowered.includes(token)) {
        hits += 1;
      }
    }
    return hits / tokens.length;
  }

  private isCrossScriptQuery(query: string, markdown: string): boolean {
    const sample = sliceCodePoints(markdown, 0, 4_000);
    const queryCjk = (query.match(/[\u3400-\u4dbf\u4e00-\u9fff]/gu) ?? []).length;
    const queryLatin = (query.match(/[a-zA-Z]/gu) ?? []).length;
    const docCjk = (sample.match(/[\u3400-\u4dbf\u4e00-\u9fff]/gu) ?? []).length;
    const docLatin = (sample.match(/[a-zA-Z]/gu) ?? []).length;
    const docTotal = docCjk + docLatin;
    if (docTotal === 0) return false;
    const docCjkRatio = docCjk / docTotal;
    if (queryCjk > 0 && docCjkRatio < 0.05 && docLatin >= 20) return true;
    if (queryCjk === 0 && queryLatin >= 2 && docCjkRatio >= 0.25 && docCjk >= 20) return true;
    return false;
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
