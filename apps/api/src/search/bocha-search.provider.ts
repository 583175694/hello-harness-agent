import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ENV_KEYS } from '../bootstrap/env.constants';
import type { SearchToolResult } from '@harness/agent-protocol';
import { fetchJson } from '../shared/fetch-json';
import type { SearchProviderAdapter, SearchRequest } from './search.types';
import { normalizeSearchResult } from './search.utils';
import { SEARCH_LIMITS } from './search.constants';

type BochaResponse = {
  data?: { webPages?: { value?: Array<Record<string, unknown>> } };
  webPages?: { value?: Array<Record<string, unknown>> };
};

@Injectable()
export class BochaSearchProvider implements SearchProviderAdapter {
  readonly name = 'bocha' as const;

  constructor(private readonly config: ConfigService) {}

  // 调用 Bocha Web Search，并将摘要结果归一化为网页线索。
  async search({ query }: SearchRequest, signal?: AbortSignal): Promise<SearchToolResult> {
    const payload = (await fetchJson(
      this.config.getOrThrow<string>(ENV_KEYS.bochaSearchUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.getOrThrow<string>(ENV_KEYS.bochaSearchApiKey)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query,
          count: SEARCH_LIMITS.resultsMax,
          freshness: 'noLimit',
          summary: true,
        }),
      },
      { signal },
    )) as BochaResponse;
    const values = payload.data?.webPages?.value ?? payload.webPages?.value ?? [];
    const results = values.slice(0, SEARCH_LIMITS.resultsMax).flatMap((item, index) => {
      const result = normalizeSearchResult(
        {
          title: item.name,
          url: item.url,
          snippet: item.summary || item.snippet,
          publishedAt: item.datePublished,
          source: item.siteName,
        },
        index,
      );
      return result ? [result] : [];
    });
    return { query, provider: this.name, results };
  }
}
