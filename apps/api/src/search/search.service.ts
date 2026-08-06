import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ENV_KEYS } from '../bootstrap/env.constants';
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

  // 仅在供应商及对应密钥齐全时向模型开放搜索能力。
  isEnabled(): boolean {
    const provider = this.config.get<SearchProvider>(ENV_KEYS.searchProvider);
    return provider === 'bocha'
      ? Boolean(this.config.get<string>(ENV_KEYS.bochaSearchApiKey))
      : provider === 'serp'
        ? Boolean(this.config.get<string>(ENV_KEYS.serperSearchApiKey))
        : false;
  }

  // 根据当前配置将查询路由到唯一启用的搜索供应商。
  async search(query: string, signal?: AbortSignal): Promise<SearchToolResult> {
    const provider = this.config.get<SearchProvider>(ENV_KEYS.searchProvider);
    if (provider === 'bocha') return this.bocha.search({ query }, signal);
    if (provider === 'serp') return this.serper.search({ query }, signal);
    throw new Error('SearchProviderNotConfigured');
  }
}
