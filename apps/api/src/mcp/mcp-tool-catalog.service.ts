import { Inject, Injectable } from '@nestjs/common';
import type { AgentToolDefinition } from '../tools/agent-tool.types';
import { McpConnectionManager } from './mcp-connection.manager';
import type { McpToolCatalogEntry, RunMcpSnapshot } from './mcp.types';

@Injectable()
export class McpToolCatalogService {
  constructor(@Inject(McpConnectionManager) private readonly connections: McpConnectionManager) {}

  getLiveGeneration(): number {
    return this.connections.getCatalogGeneration();
  }

  lookupEntry(publicName: string, snapshot?: RunMcpSnapshot): McpToolCatalogEntry | undefined {
    const entries = snapshot?.entries ?? this.connections.getPublishedEntries();
    return entries.find((entry) => entry.publicName === publicName);
  }

  definitionsForRun(snapshot?: RunMcpSnapshot): AgentToolDefinition[] {
    const entries = snapshot?.entries ?? this.connections.getPublishedEntries();
    return entries.map((entry) => ({
      name: entry.publicName,
      description: entry.description || `MCP tool ${entry.rawName} on ${entry.serverName}`,
      parameters: entry.parameters,
    }));
  }
}
