import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { McpServerConfigRepository } from './mcp-server-config.repository';
import { McpConnectionManager } from './mcp-connection.manager';
import type { McpToolCatalogEntry, RunMcpSnapshot } from './mcp.types';

@Injectable()
export class McpRunLatchService {
  constructor(
    @Inject(McpServerConfigRepository) private readonly configs: McpServerConfigRepository,
    @Inject(McpConnectionManager) private readonly connections: McpConnectionManager,
  ) {}

  async captureForUser(userId: string = LOCAL_USER_ID): Promise<RunMcpSnapshot> {
    const enabled = await this.configs.listEnabled(userId);
    const published = this.connections.getPublishedCatalog();
    const entries: McpToolCatalogEntry[] = [];

    for (const config of enabled) {
      const view = published.servers.get(config.serverName);
      if (!view || view.status !== 'connected') {
        if (config.required) {
          throw new ConflictException({
            code: AGENT_ERROR_CODES.mcpRequiredServerUnavailable,
            detail: `必需的 MCP Server「${config.serverName}」未就绪：${view?.lastError ?? '未连接'}`,
          });
        }
        continue;
      }
      for (const entry of published.entries) {
        if (entry.serverName === config.serverName) entries.push(entry);
      }
    }

    return { catalogGeneration: published.generation, entries };
  }
}
