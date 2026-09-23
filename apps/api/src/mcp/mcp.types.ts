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

export type RunMcpSnapshot = {
  catalogGeneration: number;
  entries: ReadonlyArray<McpToolCatalogEntry>;
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
