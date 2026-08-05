import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { SearchToolResult } from '@harness/agent-protocol';
import type { SearchProviderAdapter, SearchRequest } from './search.types';
import { fetchJson, normalizeSearchResult } from './search.utils';

type BochaResponse = {
  data?: { webPages?: { value?: Array<Record<string, unknown>> } };
  webPages?: { value?: Array<Record<string, unknown>> };
};

@Injectable()
export class BochaSearchProvider implements SearchProviderAdapter {
  readonly name = 'bocha' as const;

  constructor(private readonly config: ConfigService) {}

  async search({ query }: SearchRequest): Promise<SearchToolResult> {
    const payload = await fetchJson(this.config.getOrThrow<string>('BOCHA_SEARCH_URL'), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.getOrThrow<string>('BOCHA_SEARCH_API_KEY')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, count: 10, freshness: 'noLimit', summary: true }),
    }) as BochaResponse;
    const values = payload.data?.webPages?.value ?? payload.webPages?.value ?? [];
    const results = values.slice(0, 10).flatMap((item, index) => {
      const result = normalizeSearchResult({
        title: item.name,
        url: item.url,
        snippet: item.summary || item.snippet,
        publishedAt: item.datePublished,
        source: item.siteName,
      }, index);
      return result ? [result] : [];
    });
    return { query, provider: this.name, results };
  }
}
