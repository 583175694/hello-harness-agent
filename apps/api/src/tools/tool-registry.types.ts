import type { RunMcpSnapshot } from '../mcp/mcp.types';

export type ToolRegistryContext = {
  userId: string;
  mcpSnapshot?: RunMcpSnapshot;
};
