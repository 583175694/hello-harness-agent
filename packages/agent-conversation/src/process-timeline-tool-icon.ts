import { isMcpPublicToolName } from '@harness/agent-protocol';

/** 思维链轨图标语义（Web Lucide / 各 Native 映射到同一套）。 */
export type ProcessTimelineToolIconKind =
  | 'search'
  | 'fileSearch'
  | 'fileText'
  | 'terminal'
  | 'clock'
  | 'plug';

/** 对齐 Web `agent-chain-of-thought` `toolIcon()`。 */
export function processTimelineToolIconKind(toolName: string): ProcessTimelineToolIconKind {
  if (toolName === 'web_search' || toolName === 'web_fetch' || toolName === 'tool_search')
    return 'search';
  if (
    toolName === 'search_file' ||
    toolName === 'read_file' ||
    toolName === 'read_file_lines'
  ) {
    return 'fileSearch';
  }
  if (
    toolName === 'create_file' ||
    toolName === 'create_report' ||
    toolName === 'ppt_export' ||
    toolName === 'skills.list' ||
    toolName === 'skills.read' ||
    toolName === 'memory_write'
  )
    return 'fileText';
  if (
    toolName === 'bash' ||
    toolName === 'job_output' ||
    toolName === 'job_list' ||
    toolName === 'job_kill'
  )
    return 'terminal';
  if (toolName === 'get_current_time' || toolName === 'execute_command') return 'clock';
  if (
    isMcpPublicToolName(toolName) ||
    toolName === 'list_mcp_resources' ||
    toolName === 'list_mcp_resource_templates' ||
    toolName === 'read_mcp_resource' ||
    toolName === 'mcp_add_server'
  )
    return 'plug';
  return 'clock';
}
