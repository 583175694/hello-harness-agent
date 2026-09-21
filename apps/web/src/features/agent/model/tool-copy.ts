export type ToolCopyInput = {
  urls?: string[];
  query?: string;
  message?: string;
  fileId?: string;
  startLine?: number;
  endLine?: number;
  fileName?: string;
  title?: string;
};

export function toolInputSummary(toolName: string, input: ToolCopyInput): string {
  if (toolName === 'web_fetch') {
    const query = input.query ? ` · ${input.query}` : '';
    return `${input.urls?.length ?? 0} 个网页${query}`;
  }
  if (toolName === 'approval_test') return input.message ?? '';
  if (toolName === 'get_current_time') return '获取当前日期和时间';
  if (toolName === 'search_file') return `${input.fileId} · ${input.query}`;
  if (toolName === 'read_file_lines') return `${input.fileId} · ${input.startLine}-${input.endLine} 行`;
  if (toolName === 'create_file') return input.fileName ?? '';
  if (toolName === 'create_report') return input.title ?? '';
  return input.query ?? '';
}

export function toolTitle(toolName: string, input: ToolCopyInput): string {
  if (toolName === 'web_fetch') return `读取 ${input.urls?.length ?? 0} 个网页`;
  if (toolName === 'approval_test') return '运行审批测试';
  if (toolName === 'get_current_time') return '获取当前日期和时间';
  if (toolName === 'search_file') return `搜索文件：${input.query}`;
  if (toolName === 'read_file_lines') return `读取文件：${input.startLine}-${input.endLine} 行`;
  if (toolName === 'create_file') return `生成文件：${input.fileName}`;
  if (toolName === 'create_report') return `生成报告：${input.title}`;
  return `搜索：${input.query}`;
}

export function toolRunningDetail(toolName: string): string {
  if (toolName === 'web_fetch') return '正在读取和过滤网页正文';
  if (toolName === 'approval_test') return '正在执行已批准的无副作用工具';
  if (toolName === 'get_current_time') return '正在获取当前日期和时间';
  if (toolName === 'search_file' || toolName === 'read_file_lines') return '正在读取用户文件';
  if (toolName === 'create_file') return '正在保存生成文件';
  if (toolName === 'create_report') return '正在保存正式报告';
  return '正在搜索公开网页';
}

export function persistedCompletedDetail(toolName: string): string {
  if (toolName === 'web_fetch') return '网页原文读取已完成';
  if (toolName === 'approval_test') return '审批测试已完成';
  if (toolName === 'search_file') return '文件关键词搜索已完成';
  if (toolName === 'read_file_lines') return '文件行读取已完成';
  if (toolName === 'create_file') return '生成文件已完成';
  if (toolName === 'create_report') return '生成报告已完成';
  return '公开网页检索已完成';
}

export function liveCompletedDetail(toolName: string): string {
  if (toolName === 'get_current_time') return '当前时间已获取';
  return persistedCompletedDetail(toolName);
}

export function persistedToolDetail(status: string, toolName: string): string {
  if (status === 'completed') return persistedCompletedDetail(toolName);
  if (status === 'cancelled') return '工具调用已取消';
  return '工具调用未完成';
}

export function persistedOutputSummary(input: {
  status: string;
  toolName: string;
  fileName?: string;
  title?: string;
  succeededCount?: number;
  failedCount?: number;
  passageCount?: number;
  resultCount?: number;
  errorDetail?: string;
}): string | undefined {
  if (input.status !== 'completed') return input.errorDetail;
  if (input.toolName === 'web_fetch') {
    return `成功 ${input.succeededCount ?? 0} 个，失败 ${input.failedCount ?? 0} 个，提取 ${input.passageCount ?? 0} 段原文`;
  }
  if (input.toolName === 'search_file') return `返回 ${input.resultCount ?? 0} 个文件命中`;
  if (input.toolName === 'read_file_lines') return `返回 ${input.resultCount ?? 0} 行文件内容`;
  if (input.toolName === 'create_file') return `已生成 ${input.fileName}`;
  if (input.toolName === 'create_report') return `生成报告：${input.title}`;
  return `返回 ${input.resultCount ?? 0} 条网页结果`;
}

export function liveOutputSummary(input: {
  toolName: string;
  fetchStats?: {
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
    networkAttemptCount: number;
    passageCount: number;
  };
  approvalEcho?: string;
  fileSearchCount?: number;
  fileReadLineCount?: number;
  fileName?: string;
  reportTitle?: string;
  searchResultCount?: number;
}): string {
  if (input.fetchStats) {
    return `成功 ${input.fetchStats.succeededCount} 个，失败 ${input.fetchStats.failedCount} 个，跳过 ${input.fetchStats.skippedCount} 个，网络请求 ${input.fetchStats.networkAttemptCount} 次，提取 ${input.fetchStats.passageCount} 段原文`;
  }
  if (input.approvalEcho !== undefined) return `返回：${input.approvalEcho}`;
  if (input.toolName === 'get_current_time') return '已返回当前时间';
  if (input.fileSearchCount !== undefined) return `返回 ${input.fileSearchCount} 个文件命中`;
  if (input.fileReadLineCount !== undefined) return `返回 ${input.fileReadLineCount} 行文件内容`;
  if (input.fileName) return `已生成 ${input.fileName}`;
  if (input.reportTitle) return `生成报告：${input.reportTitle}`;
  return `返回 ${input.searchResultCount ?? 0} 条网页结果`;
}

export function persistedActivityStatus(
  completedCount: number,
  cancelledCount: number,
  total: number,
): 'completed' | 'cancelled' | 'failed' {
  if (completedCount) return 'completed';
  if (cancelledCount === total) return 'cancelled';
  return 'failed';
}

export function persistedActiveView(
  sourceCount: number,
  contextOnly: boolean,
): 'sources' | 'context' | 'activity' {
  if (sourceCount) return 'sources';
  if (contextOnly) return 'context';
  return 'activity';
}

export function liveToolCounts(
  completedEvent:
    | { toolName: string; result?: { results?: unknown[] } | object }
    | undefined,
  fileSearch?: { result: { matches: unknown[] } },
  fileReadLines?: { result: { lines: unknown[] } },
): number | undefined {
  if (
    completedEvent &&
    (completedEvent.toolName === 'web_search' || completedEvent.toolName === 'web_fetch')
  ) {
    const result = completedEvent.result as { results?: unknown[] } | undefined;
    return result?.results?.length;
  }
  if (fileSearch) return fileSearch.result.matches.length;
  if (fileReadLines) return fileReadLines.result.lines.length;
  return undefined;
}

export function fetchProvenance(
  userProvided: boolean,
  fromSearchClue: boolean,
): 'user_provided' | 'search_clue' | 'model_proposed' {
  if (userProvided) return 'user_provided';
  if (fromSearchClue) return 'search_clue';
  return 'model_proposed';
}

export function toolEventStatus(
  type: 'tool.completed' | 'tool.failed' | 'tool.cancelled',
): 'completed' | 'cancelled' | 'failed' {
  if (type === 'tool.completed') return 'completed';
  if (type === 'tool.cancelled') return 'cancelled';
  return 'failed';
}
