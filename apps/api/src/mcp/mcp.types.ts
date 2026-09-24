import type { McpDefaultApproval } from '@prisma/client';

export type McpServerRuntimeStatus = 'connected' | 'degraded' | 'disconnected';

export type McpToolCatalogEntry = {
  publicName: string;
  serverName: string;
  rawName: string;
  description: string;
  parameters: Record<string, unknown>;
  defaultApproval: McpDefaultApproval;
  boundGeneration: number;
  toolCallTimeoutMs: number;
};

export type McpServerInstructionSnapshot = {
  serverName: string;
  text: string;
  maxInstructionBytes: number;
};

export type RunMcpSnapshot = {
  catalogGeneration: number;
  entries: ReadonlyArray<McpToolCatalogEntry>;
  serverInstructions: ReadonlyArray<McpServerInstructionSnapshot>;
  /** 本 Run 已 latch 的 connected MCP server 名（含无 tool 但可 read resource 的 server）。 */
  latchedServerNames: ReadonlyArray<string>;
};

export type McpResolvedTransport = {
  url: string;
  headers: Record<string, string>;
};

export type McpPublishedServerView = {
  configId: string;
  serverName: string;
  required: boolean;
  defaultApproval: McpDefaultApproval;
  enabledTools: string[] | null;
  disabledTools: string[] | null;
  toolCallTimeoutMs: number;
  status: McpServerRuntimeStatus;
  lastError: string | null;
  toolCountTotal: number;
  toolCountExposed: number;
  instructions: string | null;
  tools: Array<{ rawName: string; description: string; inputSchema: Record<string, unknown> }>;
};

export type McpPublishedCatalog = {
  generation: number;
  servers: Map<string, McpPublishedServerView>;
  entries: McpToolCatalogEntry[];
};

export const MCP_PUBLIC_NAME_PREFIX = 'mcp__';

export function isMcpPublicToolName(name: string): boolean {
  return name.startsWith(MCP_PUBLIC_NAME_PREFIX);
}

const MCP_RESOURCE_TOOL_NAMES = new Set([
  'list_mcp_resources',
  'list_mcp_resource_templates',
  'read_mcp_resource',
]);

export function isMcpResourceToolName(name: string): boolean {
  return MCP_RESOURCE_TOOL_NAMES.has(name);
}
