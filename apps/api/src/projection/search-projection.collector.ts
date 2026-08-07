import type {
  SearchSourceSnapshot,
  SearchToolResult,
  ToolExecutionSnapshot,
} from '@harness/agent-protocol';

// 收集搜索工具执行摘要和去重来源，隔离 Workbench 所需的搜索投影。
export class SearchProjectionCollector {
  private readonly executions: ToolExecutionSnapshot[] = [];
  private readonly sources = new Map<string, SearchSourceSnapshot>();

  // 记录一次成功的搜索执行及其来源。
  recordCompleted(input: {
    toolCallId: string;
    toolName: string;
    query: string;
    completedAt: string;
    durationMs: number;
    result: SearchToolResult;
  }): void {
    this.executions.push({
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      input: { query: input.query },
      status: 'completed',
      startedAt: new Date(new Date(input.completedAt).getTime() - input.durationMs).toISOString(),
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      resultCount: input.result.results.length,
    });
    // URL 是当前来源的稳定去重键；同一来源仍保留全部关联 toolCallId 便于定位。
    for (const source of input.result.results) {
      const existing = this.sources.get(source.url);
      if (existing) {
        if (!existing.toolCallIds.includes(input.toolCallId))
          existing.toolCallIds.push(input.toolCallId);
      } else {
        this.sources.set(source.url, {
          ...source,
          provider: input.result.provider,
          retrievedAt: input.completedAt,
          toolCallIds: [input.toolCallId],
        });
      }
    }
  }

  // 记录失败执行，让 Activity 在恢复时仍能显示失败原因。
  recordFailed(input: {
    toolCallId: string;
    toolName: string;
    query: string;
    completedAt: string;
    durationMs: number;
    code: string;
    detail: string;
  }): void {
    this.executions.push({
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      input: { query: input.query },
      status: 'failed',
      startedAt: new Date(new Date(input.completedAt).getTime() - input.durationMs).toISOString(),
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      error: { code: input.code, detail: input.detail },
    });
  }

  // 返回不可变快照，避免调用方修改投影内部集合。
  snapshot(): { executions: ToolExecutionSnapshot[]; sources: SearchSourceSnapshot[] } {
    return { executions: [...this.executions], sources: [...this.sources.values()] };
  }
}
