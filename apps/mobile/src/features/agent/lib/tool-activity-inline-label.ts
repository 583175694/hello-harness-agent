/** 对齐 Web `agent-chain-of-thought` inline summary 规则。 */
export function toolActivityInlineSummary(
  toolName: string,
  title: string,
  summary: string,
): string | null {
  if (!summary.trim() || summary === title) return null;
  const n = toolName.toLowerCase();
  if (n === 'web_search' || n === 'web_fetch') return null;
  if (n.includes('bash') || n.includes('command') || n.includes('terminal')) return null;
  return summary;
}

export function toolActivityPrimaryLine(
  toolName: string,
  title: string,
  summary: string,
): string {
  if (toolActivityInlineSummary(toolName, title, summary)) return title;
  const n = toolName.toLowerCase();
  if ((n === 'web_search' || n === 'web_fetch') && summary.trim() && summary !== title) {
    return `搜索：${summary}`;
  }
  return title || 'tool';
}

export function toolActivityAccessibilityLabel(
  toolName: string,
  title: string,
  summary: string,
): string {
  const inline = toolActivityInlineSummary(toolName, title, summary);
  const line = toolActivityPrimaryLine(toolName, title, summary);
  return inline ? `${line}，${inline}` : line;
}
