import { Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import type {
  WebFetchInput,
  WebFetchItemResult,
  WebFetchSucceededItem,
} from '@harness/agent-protocol';
import { BatchPassageBudgeter } from './batch-passage.budgeter';
import { CrawleeWebContentFetcher } from './crawlee-web-content.fetcher';
import { DocumentNormalizer } from './document.normalizer';
import { DocumentQualityGate } from './document-quality.gate';
import { HtmlContentExtractor } from './html-content.extractor';
import { PassageChunker } from './passage.chunker';
import { PassageRanker } from './passage.ranker';
import { WebFetchCache } from './web-fetch.cache';
import { asWebFetchError, WebFetchError } from './web-fetch.error';
import { WebFetchUrlGuard } from './web-fetch-url.guard';
import type { GuardedWebUrl, NormalizedWebDocument, RankedWebPassage } from './web-fetch.types';

@Injectable()
export class WebFetchService {
  constructor(
    private readonly guard: WebFetchUrlGuard,
    private readonly fetcher: CrawleeWebContentFetcher,
    private readonly cache: WebFetchCache,
    private readonly extractor: HtmlContentExtractor,
    private readonly normalizer: DocumentNormalizer,
    private readonly qualityGate: DocumentQualityGate,
    private readonly chunker: PassageChunker,
    private readonly ranker: PassageRanker,
    private readonly budgeter: BatchPassageBudgeter,
  ) {}

  // 批量读取 URL 并生成按输入顺序排列的 fetched-source 材料。
  async fetch(
    input: WebFetchInput,
    signal?: AbortSignal,
  ): Promise<{
    result: { query?: string; results: WebFetchItemResult[] };
    networkAttempts: number;
  }> {
    if (signal?.aborted)
      throw new WebFetchError(AGENT_ERROR_CODES.fetchCancelled, '网页读取已取消。');
    const results = new Map<number, WebFetchItemResult>();
    const documents = new Map<number, NormalizedWebDocument>();
    const cacheStatuses = new Map<number, 'hit' | 'miss'>();
    const misses: Array<{ index: number; target: GuardedWebUrl }> = [];
    const guardedUrlIndexes = new Map<string, number>();
    let networkAttemptCount = 0;

    for (const [index, requestedUrl] of input.urls.entries()) {
      try {
        const target = await this.guard.validate(requestedUrl);
        if (guardedUrlIndexes.has(target.normalizedUrl)) {
          results.set(index, {
            status: 'skipped',
            requestedUrl,
            code: AGENT_ERROR_CODES.fetchDuplicateSkipped,
            detail: '当前批次已经包含等价网页地址。',
          });
          continue;
        }
        guardedUrlIndexes.set(target.normalizedUrl, index);
        const cached = this.cache.get(target.normalizedUrl);
        if (cached) {
          documents.set(index, { ...cached, requestedUrl });
          cacheStatuses.set(index, 'hit');
        } else misses.push({ index, target });
      } catch (error) {
        results.set(index, this.failed(requestedUrl, error));
      }
    }

    if (misses.length) {
      const fetched = await this.fetcher.fetchAll(
        misses.map((item) => item.target),
        signal,
      );
      networkAttemptCount = fetched.networkAttemptCount;
      for (let missIndex = 0; missIndex < misses.length; missIndex += 1) {
        const miss = misses[missIndex];
        const transport = fetched.results[missIndex];
        if (!miss || !transport) continue;
        if (transport.status === 'failed') {
          results.set(miss.index, transport);
          continue;
        }
        try {
          const extracted =
            transport.content.contentType === 'text/plain'
              ? {
                  markdown: transport.content.body,
                  title: new URL(transport.content.finalUrl).hostname,
                }
              : this.extractor.extract(transport.content.body, transport.content.finalUrl);
          const normalizedUrl = await this.chooseNormalizedUrl(
            transport.content.finalUrl,
            extracted.canonicalUrl,
          );
          const document = this.normalizer.normalize({
            fetched: transport.content,
            extracted,
            normalizedUrl,
          });
          this.qualityGate.validate(document);
          documents.set(miss.index, document);
          cacheStatuses.set(miss.index, 'miss');
          this.cache.set(miss.target.normalizedUrl, document);
        } catch (error) {
          results.set(miss.index, this.failed(miss.target.requestedUrl, error));
        }
      }
    }

    const rankedByDocument: RankedWebPassage[][] = [];
    for (let index = 0; index < input.urls.length; index += 1) {
      const document = documents.get(index);
      rankedByDocument[index] = document
        ? this.ranker.rank(document, this.chunker.chunk(document), input.query, index)
        : [];
    }
    const selected = this.budgeter.select(rankedByDocument);
    for (let index = 0; index < input.urls.length; index += 1) {
      if (results.has(index)) continue;
      const document = documents.get(index);
      if (!document) {
        results.set(index, {
          status: 'failed',
          requestedUrl: input.urls[index] ?? '',
          code: AGENT_ERROR_CODES.fetchUpstreamFailed,
          detail: '网页读取未返回结果。',
        });
        continue;
      }
      if (input.query && !rankedByDocument[index]?.length) {
        results.set(index, {
          status: 'failed',
          requestedUrl: input.urls[index] ?? '',
          code: AGENT_ERROR_CODES.fetchContentNotRelevant,
          detail: '网页正文与当前信息需求不相关。',
        });
        continue;
      }
      results.set(
        index,
        this.succeeded(
          document,
          cacheStatuses.get(index) ?? 'miss',
          (selected.get(index) ?? []).map((item) => item.passage),
        ),
      );
    }
    return {
      result: {
        ...(input.query ? { query: input.query } : {}),
        results: input.urls.map((_url, index) => results.get(index) as WebFetchItemResult),
      },
      networkAttempts: networkAttemptCount,
    };
  }

  // canonical URL 只有通过同一最小安全校验后才能成为来源规范地址。
  private async chooseNormalizedUrl(finalUrl: string, canonicalUrl?: string): Promise<string> {
    if (canonicalUrl) {
      try {
        return (await this.guard.validate(canonicalUrl)).normalizedUrl;
      } catch {
        /* 回退最终地址。 */
      }
    }
    return (await this.guard.validate(finalUrl)).normalizedUrl;
  }

  // 把规范化文档和批次预算后的 Passage 转换为协议成功项。
  private succeeded(
    document: NormalizedWebDocument,
    cacheStatus: 'hit' | 'miss',
    passages: WebFetchSucceededItem['passages'],
  ): WebFetchSucceededItem {
    return {
      status: 'succeeded',
      requestedUrl: document.requestedUrl,
      finalUrl: document.finalUrl,
      normalizedUrl: document.normalizedUrl,
      title: document.title,
      ...(document.author ? { author: document.author } : {}),
      ...(document.publishedAt ? { publishedAt: document.publishedAt } : {}),
      ...(document.language ? { language: document.language } : {}),
      contentType: document.contentType,
      retrievedAt: document.retrievedAt,
      contentHash: document.contentHash,
      cacheStatus,
      truncated: document.truncated,
      passages,
    };
  }

  // 把单项异常转换为不泄露内部信息的协议失败项。
  private failed(requestedUrl: string, error: unknown): WebFetchItemResult {
    const normalized = asWebFetchError(
      error,
      AGENT_ERROR_CODES.fetchUpstreamFailed,
      '网页来源暂时无法读取。',
    );
    return { status: 'failed', requestedUrl, code: normalized.code, detail: normalized.message };
  }
}
