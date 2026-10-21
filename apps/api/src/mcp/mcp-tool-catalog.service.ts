import { Inject, Injectable } from '@nestjs/common';
import type { AgentToolDefinition } from '../tools/agent-tool.types';
import { McpConnectionManager } from './mcp-connection.manager';
import type { McpToolCatalogEntry, RunMcpSnapshot } from './mcp.types';

@Injectable()
export class McpToolCatalogService {
  constructor(@Inject(McpConnectionManager) private readonly connections: McpConnectionManager) {}

  getLiveGeneration(userId: string): number {
    return this.connections.getCatalogGeneration(userId);
  }

  lookupEntry(
    publicName: string,
    snapshot: RunMcpSnapshot | undefined,
    userId: string,
  ): McpToolCatalogEntry | undefined {
    const entries = snapshot?.entries ?? this.connections.getPublishedEntries(userId);
    return entries.find((entry) => entry.publicName === publicName);
  }

  definitionsForRun(snapshot: RunMcpSnapshot | undefined, userId: string): AgentToolDefinition[] {
    const entries = snapshot?.entries ?? this.connections.getPublishedEntries(userId);
    return entries.map((entry) => ({
      name: entry.publicName,
      description: entry.description || `MCP tool ${entry.rawName} on ${entry.serverName}`,
      parameters: entry.parameters,
    }));
  }
}
