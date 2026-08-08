import type { SearchProvider, SearchToolResult } from '@harness/agent-protocol';

export type SearchRequest = { query: string };

export interface SearchProviderAdapter {
  readonly name: SearchProvider;
  // 将供应商响应转换为统一的搜索工具结果。
  search(input: SearchRequest, signal?: AbortSignal): Promise<SearchToolResult>;
}
