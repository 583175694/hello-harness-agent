import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

import { isMcpPublicToolName } from '../mcp/mcp.types';

export type ToolPresentationKind =
  | 'web_search'
  | 'web_fetch'
  | 'builtin'
  | 'mcp'
  | 'unknown';

const BUILTIN_TOOL_NAMES = new Set<string>(Object.values(AGENT_TOOL_NAMES));

export function classifyToolPresentation(toolName: string): ToolPresentationKind {
  if (toolName === AGENT_TOOL_NAMES.webSearch) return 'web_search';
  if (toolName === AGENT_TOOL_NAMES.webFetch) return 'web_fetch';
  if (isMcpPublicToolName(toolName)) return 'mcp';
  if (BUILTIN_TOOL_NAMES.has(toolName)) return 'builtin';
  return 'unknown';
}

export function isExternalPresentation(toolName: string): boolean {
  const kind = classifyToolPresentation(toolName);
  return kind === 'mcp' || kind === 'unknown';
}

export function externalSubKind(toolName: string): 'mcp' | 'unknown' {
  return isMcpPublicToolName(toolName) ? 'mcp' : 'unknown';
}
