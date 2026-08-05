import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { SearchProvider, SearchToolResult } from '@harness/agent-protocol';
import { BochaSearchProvider } from './bocha-search.provider';
import { SerperSearchProvider } from './serper-search.provider';

@Injectable()
export class SearchService {
  constructor(
    private readonly config: ConfigService,
    private readonly bocha: BochaSearchProvider,
    private readonly serper: SerperSearchProvider,
  ) {}

  isEnabled(): boolean {
    const provider = this.config.get<SearchProvider>('SEARCH_PROVIDER');
    return provider === 'bocha'
      ? Boolean(this.config.get<string>('BOCHA_SEARCH_API_KEY'))
      : provider === 'serp'
        ? Boolean(this.config.get<string>('SERPER_SEARCH_API_KEY'))
        : false;
  }

  async search(query: string): Promise<SearchToolResult> {
    const provider = this.config.get<SearchProvider>('SEARCH_PROVIDER');
    if (provider === 'bocha') return this.bocha.search({ query });
    if (provider === 'serp') return this.serper.search({ query });
    throw new Error('SearchProviderNotConfigured');
  }
}
