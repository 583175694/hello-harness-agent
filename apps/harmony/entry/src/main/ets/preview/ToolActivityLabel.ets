import { HarnessColors } from '../coreui/HarnessColors';

export function toolActivityInlineSummary(toolName: string, title: string, summary: string): string | null {
  if (summary.length === 0 || summary === title) {
    return null;
  }
  const n = toolName.toLowerCase();
  if (n === 'web_search' || n === 'web_fetch') {
    return null;
  }
  if (n.includes('bash') || n.includes('command') || n.includes('terminal')) {
    return null;
  }
  return summary;
}

export function toolActivityPrimaryLine(toolName: string, title: string, summary: string): string {
  if (toolActivityInlineSummary(toolName, title, summary) !== null) {
    return title.length > 0 ? title : 'tool';
  }
  const n = toolName.toLowerCase();
  if ((n === 'web_search' || n === 'web_fetch') && summary.length > 0 && summary !== title) {
    return `搜索：${summary}`;
  }
  return title.length > 0 ? title : 'tool';
}

export function toolActivitySeparatorColor(useDark: boolean): string {
  return HarnessColors.mutedText(useDark);
}
