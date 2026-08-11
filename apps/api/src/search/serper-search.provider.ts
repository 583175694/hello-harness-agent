import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ENV_KEYS } from '../bootstrap/env.constants';
import type { SearchToolResult } from '@harness/agent-protocol';
import { fetchJson } from '../shared/fetch-json';
import type { SearchProviderAdapter, SearchRequest } from './search.types';
import { normalizeSearchResult } from './search.utils';
import { SEARCH_LIMITS } from './search.constants';

type SerperResponse = { organic?: Array<Record<string, unknown>> };

@Injectable()
export class SerperSearchProvider implements SearchProviderAdapter {
  readonly name = 'serp' as const;

  constructor(private readonly config: ConfigService) {}

  // 调用 Serper 搜索，并将 organic results 归一化为网页线索。
  async search({ query }: SearchRequest, signal?: AbortSignal): Promise<SearchToolResult> {
    const payload = (await fetchJson(
      this.config.getOrThrow<string>(ENV_KEYS.serperSearchUrl),
      {
        method: 'POST',
        headers: {
          'x-api-key': this.config.getOrThrow<string>(ENV_KEYS.serperSearchApiKey),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: SEARCH_LIMITS.resultsMax }),
      },
      { signal },
    )) as SerperResponse;
    const results = (payload.organic ?? [])
      .slice(0, SEARCH_LIMITS.resultsMax)
      .flatMap((item, index) => {
        const result = normalizeSearchResult(
          {
            title: item.title,
            url: item.link,
            snippet: item.snippet,
            publishedAt: item.date,
            source: item.source,
          },
          index,
        );
        return result ? [result] : [];
      });
    return { query, provider: this.name, results };
  }
}
