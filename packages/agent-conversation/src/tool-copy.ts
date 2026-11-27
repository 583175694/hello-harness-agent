import {
  isMcpPublicToolName,
  mcpToolBusinessSummary as protocolMcpToolBusinessSummary,
  MCP_PUBLIC_TOOL_PREFIX as MCP_PUBLIC_PREFIX,
  parseMcpPublicToolName,
} from '@harness/agent-protocol';

export { isMcpPublicToolName, parseMcpPublicToolName };

export function mcpToolBusinessSummary(
  publicName: string,
  input: ToolCopyInput | Record<string, unknown>,
): string {
  return protocolMcpToolBusinessSummary(publicName, input as Record<string, unknown>);
}

/** 对话区内联 MCP 步骤：只展示业务输入一行，不重复「server · tool + rawName」。 */
export function mcpInlineActivityLabel(block: {
  toolName: string;
  title: string;
  summary?: string;
}): string {
  if (!isMcpPublicToolName(block.toolName)) return block.title;
  const summary = block.summary?.trim();
  const parsed = parseMcpPublicToolName(block.toolName);
  const rawName = parsed?.rawName;
  if (summary && (!rawName || summary !== rawName)) return summary;
  return summary || block.title;
}

export function mcpFriendlyToolTitle(publicName: string): string {
  if (publicName.startsWith(MCP_PUBLIC_PREFIX)) {
    const rest = publicName.slice(MCP_PUBLIC_PREFIX.length);
    const separator = rest.indexOf('__');
    if (separator > 0) {
      return `${rest.slice(0, separator)} · ${rest.slice(separator + 2)}`;
    }
  }
  return `运行工具 ${publicName}`;
}

export function resolveActivityToolName(toolName: string, publicName?: string): string {
  if (toolName === 'external_tool' && publicName) return publicName;
  return toolName;
}

export type ToolCopyInput = {
  urls?: string[];
  query?: string;
  message?: string;
  fileId?: string;
  scope?: 'file' | 'section' | 'lines';
  sectionId?: string;
  startLine?: number;
  endLine?: number;
  fileName?: string;
  title?: string;
  slideCount?: number;
  command?: string;
  description?: string;
  workdir?: string;
  policyClass?: 'network' | 'install';
  inputFiles?: Array<{ fileId: string; path: string }>;
  job_id?: string;
  action?: string;
  memoryId?: string;
  name?: string;
  version?: string;
  server?: string;
  uri?: string;
  serverName?: string;
  url?: string;
};

export function toolInputSummary(toolName: string, input: ToolCopyInput): string {
  if (toolName === 'web_fetch') {
    const query = input.query ? ` · ${input.query}` : '';
    return `${input.urls?.length ?? 0} 个网页${query}`;
  }
  if (toolName === 'approval_test') return input.message ?? '';
  if (toolName === 'get_current_time') return '获取当前日期和时间';
  if (toolName === 'search_file') return `${input.fileId} · ${input.query}`;
  if (toolName === 'read_file') {
    if (input.scope === 'file') return `${input.fileId} · outline`;
    if (input.scope === 'section') return `${input.fileId} · ${input.sectionId ?? 'section'}`;
    return `${input.fileId} · ${input.startLine}-${input.endLine} 行`;
  }
  if (toolName === 'read_file_lines')
    return `${input.fileId} · ${input.startLine}-${input.endLine} 行`;
  if (toolName === 'create_file') return input.fileName ?? '';
  if (toolName === 'create_report') return input.title ?? '';
  if (toolName === 'ppt_export') {
    const slides = input.slideCount ? ` · ${input.slideCount} 页` : '';
    return `${input.title ?? input.fileName ?? ''}${slides}`;
  }
  if (toolName === 'bash') {
    const policy =
      input.policyClass === 'network'
        ? ' · 网络访问'
        : input.policyClass === 'install'
          ? ' · 安装依赖'
          : '';
    const staged = input.inputFiles?.length
      ? ` · Stage: ${input.inputFiles.map((file) => `${file.path} (${file.fileId.slice(0, 8)}…)`).join(', ')}`
      : '';
    return `${input.description ?? ''}${policy}${staged}${input.command ? ` · ${input.command}` : ''}`;
  }
  if (toolName === 'job_output') return input.job_id ?? '';
  if (toolName === 'job_kill') return input.job_id ?? '';
  if (toolName === 'job_list') return '列出后台 job';
  if (toolName === 'execute_command') return input.command ?? '';
  if (toolName === 'web_search') return input.query ?? '';
  if (toolName === 'tool_search') return input.query ?? '';
  if (toolName === 'memory_write') {
    const action = typeof input.action === 'string' ? input.action : '';
    if (action === 'delete') return input.memoryId ? `删除 ${input.memoryId}` : '删除记忆';
    if (action === 'update') return input.title ?? '更新记忆';
    return input.title ?? '写入记忆';
  }
  if (toolName === 'skills.list') return input.query ? `检索技能：${input.query}` : '列出可用技能';
  if (toolName === 'skills.read') return input.name ?? '读取技能';
  if (toolName === 'list_mcp_resources') return input.server ?? '列出 MCP 资源';
  if (toolName === 'list_mcp_resource_templates') return input.server ?? '列出 MCP 资源模板';
  if (toolName === 'read_mcp_resource')
    return input.server && input.uri ? `${input.server} · ${input.uri}` : (input.uri ?? input.server ?? '');
  if (toolName === 'mcp_add_server')
    return input.serverName && input.url
      ? `${input.serverName} (${input.url})`
      : (input.serverName ?? input.url ?? '');
  if (toolName.startsWith(MCP_PUBLIC_PREFIX)) {
    return mcpToolBusinessSummary(toolName, input);
  }
  return '';
}

export function toolTitle(toolName: string, input: ToolCopyInput): string {
  if (toolName === 'web_fetch') return `读取 ${input.urls?.length ?? 0} 个网页`;
  if (toolName === 'approval_test') return '运行审批测试';
  if (toolName === 'get_current_time') return '获取当前日期和时间';
  if (toolName === 'search_file') return `搜索文件：${input.query}`;
  if (toolName === 'read_file') {
    if (input.scope === 'file') return '读取文件 outline';
    if (input.scope === 'section') return `读取章节：${input.sectionId ?? ''}`.trim();
    return `读取文件：${input.startLine}-${input.endLine} 行`;
  }
  if (toolName === 'read_file_lines') return `读取文件：${input.startLine}-${input.endLine} 行`;
  if (toolName === 'create_file') return `生成文件：${input.fileName}`;
  if (toolName === 'create_report') return `生成报告：${input.title}`;
  if (toolName === 'ppt_export') return `生成演示稿：${input.title ?? ''}`.trim();
  if (toolName === 'bash') {
    return input.description?.trim() ? `Bash · ${input.description.trim()}` : 'Bash';
  }
  if (toolName === 'job_output') return '读取后台 job 输出';
  if (toolName === 'job_list') return '列出后台 job';
  if (toolName === 'job_kill') return '终止后台 job';
  if (toolName === 'execute_command') return '执行命令';
  if (toolName === 'web_search') return `搜索：${input.query}`;
  if (toolName === 'tool_search') return input.query ? `检索工具：${input.query}` : '检索工具';
  if (toolName === 'memory_write') return '写入记忆';
  if (toolName === 'skills.list') return input.query ? `列出技能：${input.query}` : '列出技能';
  if (toolName === 'skills.read') return input.name ? `读取技能：${input.name}` : '读取技能';
  if (toolName === 'list_mcp_resources')
    return input.server ? `列出 MCP 资源：${input.server}` : '列出 MCP 资源';
  if (toolName === 'list_mcp_resource_templates')
    return input.server ? `列出 MCP 资源模板：${input.server}` : '列出 MCP 资源模板';
  if (toolName === 'read_mcp_resource')
    return input.server ? `读取 MCP 资源：${input.server}` : '读取 MCP 资源';
  if (toolName === 'mcp_add_server')
    return input.serverName ? `添加 MCP 服务：${input.serverName}` : '添加 MCP 服务';
  if (toolName === 'external_tool') return '外部工具';
  if (toolName.startsWith(MCP_PUBLIC_PREFIX)) return mcpFriendlyToolTitle(toolName);
  return `运行工具 ${toolName}`;
}

export function toolStreamTitle(
  toolName: string,
  input: ToolCopyInput,
  options?: { publicName?: string },
): string {
  if (toolName === 'external_tool' && options?.publicName) {
    return mcpFriendlyToolTitle(options.publicName);
  }
  return toolTitle(toolName, input);
}

export function asToolCopyInput(input: unknown): ToolCopyInput {
  if (typeof input !== 'object' || input === null) return {};
  return input as ToolCopyInput;
}

export function streamToolTitle(event: {
  toolName: string;
  input?: unknown;
  publicName?: string;
}): string {
  return toolStreamTitle(event.toolName, asToolCopyInput(event.input), {
    publicName: event.publicName,
  });
}

export function streamToolInputSummary(event: {
  toolName: string;
  input?: unknown;
  publicName?: string;
}): string {
  if (event.toolName === 'external_tool' && event.publicName) {
    return mcpToolBusinessSummary(event.publicName, asToolCopyInput(event.input));
  }
  const displayName = resolveActivityToolName(event.toolName, event.publicName);
  return toolInputSummary(displayName, asToolCopyInput(event.input));
}

export function toolRunningDetail(toolName: string): string {
  if (toolName === 'web_fetch') return '正在读取和过滤网页正文';
  if (toolName === 'approval_test') return '正在执行已批准的无副作用工具';
  if (toolName === 'get_current_time') return '正在获取当前日期和时间';
  if (toolName === 'search_file' || toolName === 'read_file' || toolName === 'read_file_lines')
    return '正在读取用户文件';
  if (toolName === 'create_file') return '正在保存生成文件';
  if (toolName === 'create_report') return '正在保存正式报告';
  if (toolName === 'ppt_export') return '正在渲染并校验 PPT';
  if (toolName === 'bash') return '正在终端执行';
  if (toolName === 'job_output') return '正在读取后台 job 输出';
  if (toolName === 'job_list') return '正在列出后台 job';
  if (toolName === 'job_kill') return '正在终止后台 job';
  if (toolName === 'execute_command') return '正在执行命令';
  if (toolName === 'web_search') return '正在搜索公开网页';
  if (toolName === 'tool_search') return '正在检索可用工具';
  if (toolName === 'memory_write') return '正在写入记忆';
  if (toolName === 'skills.list') return '正在列出可用技能';
  if (toolName === 'skills.read') return '正在读取技能说明';
  if (toolName === 'list_mcp_resources') return '正在列出 MCP 资源';
  if (toolName === 'list_mcp_resource_templates') return '正在列出 MCP 资源模板';
  if (toolName === 'read_mcp_resource') return '正在读取 MCP 资源';
  if (toolName === 'mcp_add_server') return '正在配置 MCP 服务';
  if (toolName === 'external_tool') return '正在执行外部工具';
  if (toolName.startsWith(MCP_PUBLIC_PREFIX)) return '正在执行 MCP 工具';
  return '正在执行工具';
}

export function persistedCompletedDetail(toolName: string): string {
  if (toolName === 'web_fetch') return '网页原文读取已完成';
  if (toolName === 'approval_test') return '审批测试已完成';
  if (toolName === 'search_file') return '文件关键词搜索已完成';
  if (toolName === 'read_file' || toolName === 'read_file_lines') return '文件读取已完成';
  if (toolName === 'create_file') return '生成文件已完成';
  if (toolName === 'create_report') return '生成报告已完成';
  if (toolName === 'ppt_export') return 'PPT 导出已完成';
  if (toolName === 'bash') return '终端命令已完成';
  if (toolName === 'job_output') return '已读取后台 job 输出';
  if (toolName === 'job_list') return '已列出后台 job';
  if (toolName === 'job_kill') return '已终止后台 job';
  if (toolName === 'execute_command') return '命令执行已完成';
  if (toolName === 'web_search') return '公开网页检索已完成';
  if (toolName === 'tool_search') return '工具检索已完成';
  if (toolName === 'memory_write') return '记忆操作已完成';
  if (toolName === 'skills.list') return '技能列表已获取';
  if (toolName === 'skills.read') return '技能说明已读取';
  if (toolName === 'list_mcp_resources') return 'MCP 资源列表已获取';
  if (toolName === 'list_mcp_resource_templates') return 'MCP 资源模板已获取';
  if (toolName === 'read_mcp_resource') return 'MCP 资源已读取';
  if (toolName === 'mcp_add_server') return 'MCP 服务配置已完成';
  return '工具调用已完成';
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

export function formatToolSearchMatchedSummary(matchedTools: readonly string[]): string {
  if (!matchedTools.length) return '未找到匹配工具';
  const labels = matchedTools.map((name) => {
    const parsed = parseMcpPublicToolName(name);
    return parsed ? `${parsed.serverName} · ${parsed.rawName}` : name;
  });
  return `找到 ${matchedTools.length} 个工具：${labels.join('、')}`;
}

export function persistedOutputSummary(input: {
  status: string;
  toolName: string;
  publicName?: string;
  toolInput?: unknown;
  fileName?: string;
  title?: string;
  succeededCount?: number;
  failedCount?: number;
  passageCount?: number;
  resultCount?: number;
  outputPreview?: string;
  errorDetail?: string;
}): string | undefined {
  if (input.status !== 'completed') return input.errorDetail;
  if (input.toolName === 'external_tool' && input.publicName) {
    return mcpToolBusinessSummary(input.publicName, asToolCopyInput(input.toolInput));
  }
  if (isMcpPublicToolName(input.toolName)) {
    return mcpToolBusinessSummary(input.toolName, asToolCopyInput(input.toolInput));
  }
  if (input.toolName === 'web_fetch') {
    return `成功 ${input.succeededCount ?? 0} 个，失败 ${input.failedCount ?? 0} 个，提取 ${input.passageCount ?? 0} 段原文`;
  }
  if (input.toolName === 'tool_search') {
    if (input.outputPreview?.trim()) return input.outputPreview;
    return input.resultCount ? `找到 ${input.resultCount} 个工具` : '未找到匹配工具';
  }
  if (input.toolName === 'search_file') return `返回 ${input.resultCount ?? 0} 个文件命中`;
  if (input.toolName === 'read_file' || input.toolName === 'read_file_lines')
    return `返回 ${input.resultCount ?? 0} 行文件内容`;
  if (input.toolName === 'create_file') return `已生成 ${input.fileName}`;
  if (input.toolName === 'create_report') return `生成报告：${input.title}`;
  if (input.toolName === 'ppt_export') return 'PPT 导出已完成';
  if (input.toolName === 'execute_command') return '命令执行已完成';
  if (input.toolName === 'web_search') return `返回 ${input.resultCount ?? 0} 条网页结果`;
  if (input.toolName === 'get_current_time') {
    return input.outputPreview?.trim() || '当前时间已获取';
  }
  if (input.toolName === 'memory_write') {
    return input.outputPreview?.trim() || '记忆操作已完成';
  }
  if (input.toolName === 'job_list') return '已列出后台 job';
  if (input.toolName === 'job_output') return '已读取 job 输出';
  if (input.toolName === 'job_kill') return '已终止后台 job';
  if (input.toolName === 'skills.list') {
    return input.resultCount !== undefined ? `列出 ${input.resultCount} 个技能` : '技能列表已获取';
  }
  if (input.toolName === 'skills.read') {
    const toolInput = asToolCopyInput(input.toolInput);
    return toolInput.name ? `已读取技能 ${toolInput.name}` : '已读取技能';
  }
  if (input.toolName === 'list_mcp_resources') {
    return input.resultCount !== undefined ? `找到 ${input.resultCount} 个资源` : '已列出 MCP 资源';
  }
  if (input.toolName === 'list_mcp_resource_templates') {
    return input.resultCount !== undefined
      ? `找到 ${input.resultCount} 个资源模板`
      : '已列出 MCP 资源模板';
  }
  if (input.toolName === 'read_mcp_resource') {
    const toolInput = asToolCopyInput(input.toolInput);
    return toolInput.server ? `已读取 ${toolInput.server} 资源` : '已读取 MCP 资源';
  }
  if (input.toolName === 'mcp_add_server') {
    const toolInput = asToolCopyInput(input.toolInput);
    return toolInput.serverName ? `已配置 MCP 服务 ${toolInput.serverName}` : '已配置 MCP 服务';
  }
  return undefined;
}

export function formatMemoryWriteOutputLabel(result: {
  ok: boolean;
  action?: string;
  status?: string;
  reason?: string;
  indexingStatus?: string;
}): string {
  if (!result.ok) {
    if (result.reason === 'memory_write_disabled') return '记忆写入未开启';
    return result.reason ? `未写入：${result.reason}` : '记忆未写入';
  }
  if (result.action === 'delete') return '记忆已删除';
  if (result.status === 'candidate') return '已保存为候选记忆';
  if (result.indexingStatus === 'pending') return '记忆已保存，向量索引排队中';
  if (result.indexingStatus === 'failed') return '记忆已保存，向量索引失败';
  return result.action === 'update' ? '记忆已更新' : '记忆已保存';
}

export function liveOutputSummary(input: {
  toolName: string;
  publicName?: string;
  toolInput?: unknown;
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
  pptExport?: { status: 'ok' | 'degraded'; fileName: string };
  searchResultCount?: number;
  toolSearch?: { matchedTools: string[]; activatedCount: number };
  memoryWrite?: {
    ok: boolean;
    action?: string;
    status?: string;
    reason?: string;
    indexingStatus?: string;
  };
  currentTime?: { date: string; time: string; timezone: string };
  jobTool?: { text: string };
  builtinSummary?: string;
}): string {
  if (input.toolName === 'external_tool' && input.publicName) {
    return mcpToolBusinessSummary(input.publicName, asToolCopyInput(input.toolInput));
  }
  if (input.fetchStats) {
    return `成功 ${input.fetchStats.succeededCount} 个，失败 ${input.fetchStats.failedCount} 个，跳过 ${input.fetchStats.skippedCount} 个，网络请求 ${input.fetchStats.networkAttemptCount} 次，提取 ${input.fetchStats.passageCount} 段原文`;
  }
  if (input.approvalEcho !== undefined) return `返回：${input.approvalEcho}`;
  if (input.currentTime) {
    return `${input.currentTime.date} ${input.currentTime.time} (${input.currentTime.timezone})`;
  }
  if (input.toolName === 'get_current_time') return '已返回当前时间';
  if (input.memoryWrite) return formatMemoryWriteOutputLabel(input.memoryWrite);
  if (input.fileSearchCount !== undefined) return `返回 ${input.fileSearchCount} 个文件命中`;
  if (input.fileReadLineCount !== undefined) return `返回 ${input.fileReadLineCount} 行文件内容`;
  if (input.fileName) return `已生成 ${input.fileName}`;
  if (input.reportTitle) return `生成报告：${input.reportTitle}`;
  if (input.pptExport) {
    if (input.pptExport.status === 'ok') return `已生成 ${input.pptExport.fileName}`;
    return `PPT 已降级为 HTML：${input.pptExport.fileName}`;
  }
  if (input.toolName === 'bash') return '终端命令已完成';
  if (input.toolName === 'job_list') return '已列出后台 job';
  if (input.toolName === 'job_output') return '已读取 job 输出';
  if (input.toolName === 'job_kill') return '已终止后台 job';
  if (input.toolName === 'execute_command') return '命令执行已完成';
  if (input.toolName === 'web_search') return `返回 ${input.searchResultCount ?? 0} 条网页结果`;
  if (input.toolName === 'tool_search' && input.toolSearch) {
    return formatToolSearchMatchedSummary(input.toolSearch.matchedTools);
  }
  if (input.builtinSummary) return input.builtinSummary;
  return '';
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
  _sourceCount: number,
  contextOnly: boolean,
): 'tool_results' | 'context' | 'deliverables' {
  if (contextOnly) return 'context';
  return 'tool_results';
}

export function liveToolCounts(
  completedEvent: { toolName: string; result?: { results?: unknown[] } | object } | undefined,
  fileSearch?: { result: { matches: unknown[] } },
  fileReadLines?: { result: { lines: unknown[] } },
  fileRead?: {
    result:
      { scope: 'file'; sections?: unknown[] } | { scope: 'section' | 'lines'; lines: unknown[] };
  },
): number | undefined {
  if (
    completedEvent &&
    (completedEvent.toolName === 'web_search' || completedEvent.toolName === 'web_fetch')
  ) {
    const result = completedEvent.result as { results?: unknown[] } | undefined;
    return result?.results?.length;
  }
  if (fileSearch) return fileSearch.result.matches.length;
  if (fileRead) {
    if (fileRead.result.scope === 'file') return fileRead.result.sections?.length ?? 0;
    return fileRead.result.lines.length;
  }
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
