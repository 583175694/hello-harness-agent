/** 对齐 `@harness/agent-conversation` `processTimelineToolIconKind`。 */
export type ProcessTimelineToolIconKind =
  | 'search'
  | 'fileSearch'
  | 'fileText'
  | 'terminal'
  | 'clock'
  | 'plug';

export function processTimelineToolIconKind(toolName: string): ProcessTimelineToolIconKind {
  if (toolName === 'web_search' || toolName === 'web_fetch') {
    return 'search';
  }
  if (toolName === 'search_file' || toolName === 'read_file' || toolName === 'read_file_lines') {
    return 'fileSearch';
  }
  if (toolName === 'create_file' || toolName === 'create_report') {
    return 'fileText';
  }
  if (toolName === 'bash') {
    return 'terminal';
  }
  if (toolName === 'get_current_time' || toolName === 'execute_command') {
    return 'clock';
  }
  if (toolName.startsWith('mcp__')) {
    return 'plug';
  }
  return 'clock';
}

/** Gate A：无矢量资源时用等宽符号占位，按 kind 区分（非统一 ⌕）。 */
export function processTimelineToolIconGlyph(kind: ProcessTimelineToolIconKind): string {
  switch (kind) {
    case 'search':
      return '⌕';
    case 'fileSearch':
      return '⎘';
    case 'fileText':
      return '▤';
    case 'terminal':
      return '⌗';
    case 'plug':
      return '⏘';
    default:
      return '◷';
  }
}
