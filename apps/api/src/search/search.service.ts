import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ENV_KEYS } from '../bootstrap/env.constants';
import type { SearchProvider, SearchToolResult } from '@harness/agent-protocol';
import { BochaSearchProvider } from './bocha-search.provider';
import { SerperSearchProvider } from './serper-search.provider';
import { EvalFixtureStore } from '../eval-fixtures/eval-fixture.store';

@Injectable()
export class SearchService {
  constructor(
    private readonly config: ConfigService,
    private readonly bocha: BochaSearchProvider,
    private readonly serper: SerperSearchProvider,
    private readonly fixtures: EvalFixtureStore,
  ) {}

  // 仅在供应商及对应密钥齐全时向模型开放搜索能力。
  isEnabled(): boolean {
    if (this.fixtures.isEnabled()) return true;
    const provider = this.config.get<SearchProvider>(ENV_KEYS.searchProvider);
    return provider === 'bocha'
      ? Boolean(this.config.get<string>(ENV_KEYS.bochaSearchApiKey))
      : provider === 'serp'
        ? Boolean(this.config.get<string>(ENV_KEYS.serperSearchApiKey))
        : false;
  }

  // 根据当前配置将查询路由到唯一启用的搜索供应商。
  async search(query: string, signal?: AbortSignal): Promise<SearchToolResult> {
    if (this.fixtures.isEnabled()) return this.fixtures.search(query);
    const provider = this.config.get<SearchProvider>(ENV_KEYS.searchProvider);
    // V1 一次只路由到一个主供应商，不在这里隐式并行或 fallback。
    if (provider === 'bocha') return this.bocha.search({ query }, signal);
    if (provider === 'serp') return this.serper.search({ query }, signal);
    throw new Error('SearchProviderNotConfigured');
  }
}
