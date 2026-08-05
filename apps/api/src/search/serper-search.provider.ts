import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { SearchToolResult } from '@harness/agent-protocol';
import type { SearchProviderAdapter, SearchRequest } from './search.types';
import { fetchJson, normalizeSearchResult } from './search.utils';

type SerperResponse = { organic?: Array<Record<string, unknown>> };

@Injectable()
export class SerperSearchProvider implements SearchProviderAdapter {
  readonly name = 'serp' as const;

  constructor(private readonly config: ConfigService) {}

  async search({ query }: SearchRequest): Promise<SearchToolResult> {
    const payload = await fetchJson(this.config.getOrThrow<string>('SERPER_SEARCH_URL'), {
      method: 'POST',
      headers: {
        'x-api-key': this.config.getOrThrow<string>('SERPER_SEARCH_API_KEY'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 10 }),
    }) as SerperResponse;
    const results = (payload.organic ?? []).slice(0, 10).flatMap((item, index) => {
      const result = normalizeSearchResult({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        publishedAt: item.date,
        source: item.source,
      }, index);
      return result ? [result] : [];
    });
    return { query, provider: this.name, results };
  }
}
