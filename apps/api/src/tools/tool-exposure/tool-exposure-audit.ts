import type { McpToolCatalogEntry } from '../../mcp/mcp.types';

/**
 * 单次 Run 内 MCP 工具暴露策略的观测累积器。
 * 只做事实统计，不改路由；用于判断直通名额是否被真正使用、tool_search 是否值得。
 */
export class ToolExposureAudit {
  private readonly directNames = new Set<string>();
  private readonly deferredNames = new Set<string>();
  private readonly activatedNames = new Set<string>();
  private readonly invokedNames = new Set<string>();
  private directInvoked = new Set<string>();
  private searchCalls = 0;
  private searchHits = 0;
  private searchFallbacks = 0;
  private activatedAndInvokedAfterSearch = new Set<string>();
  private readonly searchActivated = new Set<string>();

  constructor(entries: ReadonlyArray<McpToolCatalogEntry> = []) {
    for (const entry of entries) {
      if (entry.exposure === 'direct') this.directNames.add(entry.publicName);
      else if (entry.exposure === 'deferred') this.deferredNames.add(entry.publicName);
    }
  }

  /** 记录一次 tool_search：命中数与是否走 fallback 列表。 */
  recordSearch(input: { hits: number; fallback: boolean; activated: readonly string[] }): void {
    this.searchCalls += 1;
    this.searchHits += input.hits;
    if (input.fallback) this.searchFallbacks += 1;
    for (const name of input.activated) {
      this.activatedNames.add(name);
      this.searchActivated.add(name);
    }
  }

  /** 记录一次真实的工具调用，区分直通、检索激活与内置工具。 */
  recordInvocation(toolName: string): void {
    if (!toolName.startsWith('mcp__')) return;
    this.invokedNames.add(toolName);
    if (this.directNames.has(toolName)) this.directInvoked.add(toolName);
    if (this.searchActivated.has(toolName)) this.activatedAndInvokedAfterSearch.add(toolName);
  }

  summary(): {
    directTotal: number;
    directInvoked: number;
    deferredTotal: number;
    searchCalls: number;
    searchHitAverage: number;
    searchFallbackCount: number;
    activatedTotal: number;
    activatedInvoked: number;
    invokedMcpTotal: number;
  } {
    return {
      directTotal: this.directNames.size,
      directInvoked: this.directInvoked.size,
      deferredTotal: this.deferredNames.size,
      searchCalls: this.searchCalls,
      searchHitAverage: this.searchCalls ? this.searchHits / this.searchCalls : 0,
      searchFallbackCount: this.searchFallbacks,
      activatedTotal: this.activatedNames.size,
      activatedInvoked: this.activatedAndInvokedAfterSearch.size,
      invokedMcpTotal: this.invokedNames.size,
    };
  }

  /** 断言用：当前直通区里从未被调用过的工具名，用于定位名额浪费。 */
  unusedDirectNames(): string[] {
    return [...this.directNames].filter((name) => !this.directInvoked.has(name));
  }
}
