import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';

import { parseMcpPublicToolName } from '../mcp/parse-mcp-public-tool-name';

export function summarizeExternalToolInput(input: unknown): Record<string, unknown> {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>) };
  }
  return {};
}

export function externalToolInputSummary(input: unknown): string {
  const record = summarizeExternalToolInput(input);
  const parts = Object.entries(record)
    .slice(0, 5)
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const clipped = text.length > 48 ? `${text.slice(0, 45)}…` : text;
      return `${key}=${clipped}`;
    });
  return parts.join(', ') || '执行中';
}

export function externalToolOutputPreview(
  output: unknown,
  max = AGENT_PROTOCOL_LIMITS.externalToolOutputPreviewMax,
): { preview: string; charCount: number; truncated: boolean } {
  const text =
    typeof output === 'string' ? output : output === undefined ? '' : JSON.stringify(output);
  const charCount = text.length;
  if (charCount <= max) return { preview: text, charCount, truncated: false };
  return { preview: text.slice(0, max), charCount, truncated: true };
}

export function externalToolTitle(publicName: string): string {
  const parsed = parseMcpPublicToolName(publicName);
  if (parsed) return `${parsed.serverName} · ${parsed.rawName}`;
  return `运行工具 ${publicName}`;
}

export function externalToolCompletedSummary(preview: {
  charCount: number;
  truncated?: boolean;
}): string {
  const suffix = preview.truncated ? '（预览已截断）' : '';
  return `返回 ${preview.charCount} 字符${suffix}`;
}
