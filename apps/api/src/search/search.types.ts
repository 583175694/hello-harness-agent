import type { SearchProvider, SearchToolResult } from '@harness/agent-protocol';

export type SearchRequest = { query: string };

export interface SearchProviderAdapter {
  readonly name: SearchProvider;
  search(input: SearchRequest): Promise<SearchToolResult>;
}
