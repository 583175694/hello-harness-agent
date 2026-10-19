import { AGENT_PROTOCOL_LIMITS, mcpToolBusinessSummary } from '@harness/agent-protocol';

import { parseMcpPublicToolName } from '../mcp/parse-mcp-public-tool-name';

export function summarizeExternalToolInput(input: unknown): Record<string, unknown> {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>) };
  }
  return {};
}

export function externalToolInputSummary(publicName: string, input: unknown): string {
  return mcpToolBusinessSummary(publicName, summarizeExternalToolInput(input));
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

/** @deprecated 使用 mcpToolBusinessSummary；保留别名避免旧引用。 */
export function externalToolCompletedSummary(
  publicName: string,
  input: unknown,
): string {
  return mcpToolBusinessSummary(publicName, summarizeExternalToolInput(input));
}
