import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import type {
  ResearchSourceSnapshot,
  SearchSourceSnapshot,
  SearchToolResult,
  ToolExecutionSnapshot,
  WebFetchInput,
  WebFetchResult,
  WebFetchSourceSnapshot,
} from '@harness/agent-protocol';

type ToolProjectionInput =
  | { toolName: typeof AGENT_TOOL_NAMES.webSearch; input: { query: string } }
  | { toolName: typeof AGENT_TOOL_NAMES.webFetch; input: WebFetchInput };

// 收集研究工具执行摘要、搜索线索和网页原文候选。
export class ResearchProjectionCollector {
  private readonly executions: ToolExecutionSnapshot[] = [];
  private readonly sources = new Map<string, ResearchSourceSnapshot>();

  // 记录一次成功搜索及其去重后的网页线索。
  recordSearchCompleted(input: {
    toolCallId: string;
    query: string;
    completedAt: string;
    durationMs: number;
    result: SearchToolResult;
  }): void {
    this.executions.push({
      toolCallId: input.toolCallId,
      toolName: AGENT_TOOL_NAMES.webSearch,
      input: { query: input.query },
      status: 'completed',
      startedAt: this.startedAt(input.completedAt, input.durationMs),
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      resultCount: input.result.results.length,
    });
    for (const source of input.result.results) {
      const key = this.normalizeUrl(source.url);
      const existing = this.sources.get(key);
      if (existing) this.addToolCall(existing, input.toolCallId);
      else this.sources.set(key, {
        ...source,
        kind: 'clue',
        provider: input.result.provider,
        retrievedAt: input.completedAt,
        toolCallIds: [input.toolCallId],
      });
    }
  }

  // 记录一次批量网页读取，并把匹配的 clue 原位升级为 Evidence Candidate。
  recordFetchCompleted(input: {
    toolCallId: string;
    toolInput: WebFetchInput;
    completedAt: string;
    durationMs: number;
    result: WebFetchResult;
  }): void {
    const succeeded = input.result.results.filter((item) => item.status === 'succeeded');
    const passageCount = succeeded.reduce((total, item) => total + item.passages.length, 0);
    this.executions.push({
      toolCallId: input.toolCallId,
      toolName: AGENT_TOOL_NAMES.webFetch,
      input: input.toolInput,
      status: 'completed',
      startedAt: this.startedAt(input.completedAt, input.durationMs),
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      resultCount: input.result.results.length,
      succeededCount: succeeded.length,
      failedCount: input.result.results.length - succeeded.length,
      passageCount,
    });
    for (const source of succeeded) {
      if (!source.passages.length) continue;
      const matchingKey = [source.requestedUrl, source.finalUrl, source.normalizedUrl]
        .map((url) => this.normalizeUrl(url))
        .find((key) => this.sources.has(key));
      const existing = matchingKey ? this.sources.get(matchingKey) : undefined;
      const toolCallIds = existing
        ? [...new Set([...existing.toolCallIds, input.toolCallId])]
        : [input.toolCallId];
      if (matchingKey) this.sources.delete(matchingKey);
      const candidate: WebFetchSourceSnapshot = {
        kind: 'evidence_candidate',
        id: existing?.id ?? source.contentHash.slice(0, 16),
        requestedUrl: source.requestedUrl,
        finalUrl: source.finalUrl,
        normalizedUrl: source.normalizedUrl,
        title: source.title,
        ...(source.author ? { author: source.author } : {}),
        ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
        ...(source.language ? { language: source.language } : {}),
        contentType: source.contentType,
        retrievedAt: source.retrievedAt,
        contentHash: source.contentHash,
        cacheStatus: source.cacheStatus,
        truncated: source.truncated,
        passages: source.passages,
        toolCallIds,
      };
      this.sources.set(this.normalizeUrl(source.normalizedUrl), candidate);
    }
  }

  // 记录工具失败，让 Activity 在刷新后仍能恢复安全错误摘要。
  recordFailed(input: ToolProjectionInput & {
    toolCallId: string;
    completedAt: string;
    durationMs: number;
    code: string;
    detail: string;
  }): void {
    this.executions.push(this.terminalExecution(input, 'failed'));
  }

  // 记录工具取消，并与普通失败保持不同终态。
  recordCancelled(input: ToolProjectionInput & {
    toolCallId: string;
    completedAt: string;
    durationMs: number;
    code: string;
    detail: string;
  }): void {
    this.executions.push(this.terminalExecution(input, 'cancelled'));
  }

  // 返回与 Collector 内部集合隔离的研究投影快照。
  snapshot(): { executions: ToolExecutionSnapshot[]; sources: ResearchSourceSnapshot[] } {
    return { executions: [...this.executions], sources: [...this.sources.values()] };
  }

  // 构造搜索或读取工具的失败/取消执行快照。
  private terminalExecution(
    input: ToolProjectionInput & {
      toolCallId: string;
      completedAt: string;
      durationMs: number;
      code: string;
      detail: string;
    },
    status: 'failed' | 'cancelled',
  ): ToolExecutionSnapshot {
    const base = {
      toolCallId: input.toolCallId,
      status,
      startedAt: this.startedAt(input.completedAt, input.durationMs),
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      error: { code: input.code, detail: input.detail },
    };
    return input.toolName === AGENT_TOOL_NAMES.webFetch
      ? { ...base, toolName: AGENT_TOOL_NAMES.webFetch, input: input.input }
      : { ...base, toolName: AGENT_TOOL_NAMES.webSearch, input: input.input };
  }

  // 根据完成时间和耗时恢复工具开始时间。
  private startedAt(completedAt: string, durationMs: number): string {
    return new Date(new Date(completedAt).getTime() - durationMs).toISOString();
  }

  // 为来源关联新增工具调用 ID，同时保持首次出现顺序。
  private addToolCall(source: SearchSourceSnapshot | WebFetchSourceSnapshot, toolCallId: string): void {
    if (!source.toolCallIds.includes(toolCallId)) source.toolCallIds.push(toolCallId);
  }

  // 规范化来源 URL，供搜索线索和 Fetch 结果跨工具去重。
  private normalizeUrl(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);
      url.hash = '';
      return url.toString();
    } catch { return rawUrl; }
  }
}
