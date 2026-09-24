import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { McpServerConfigRepository } from './mcp-server-config.repository';
import { McpConnectionManager } from './mcp-connection.manager';
import type { McpServerInstructionSnapshot, McpToolCatalogEntry, RunMcpSnapshot } from './mcp.types';
import {
  estimateMcpDefinitionTokens,
  MCP_DEFINITIONS_TOKEN_WARN_THRESHOLD,
} from './mcp-latch-observability';

@Injectable()
export class McpRunLatchService {
  private readonly logger = new Logger(McpRunLatchService.name);

  constructor(
    @Inject(McpServerConfigRepository) private readonly configs: McpServerConfigRepository,
    @Inject(McpConnectionManager) private readonly connections: McpConnectionManager,
  ) {}

  async captureForUser(userId: string = LOCAL_USER_ID, runId?: string): Promise<RunMcpSnapshot> {
    const enabled = await this.configs.listEnabled(userId);
    const published = this.connections.getPublishedCatalog();
    const entries: McpToolCatalogEntry[] = [];
    const serverInstructions: McpServerInstructionSnapshot[] = [];
    const latchedServerNames: string[] = [];

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
      latchedServerNames.push(config.serverName);
      if (view.instructions?.trim()) {
        serverInstructions.push({
          serverName: config.serverName,
          text: view.instructions.trim(),
          maxInstructionBytes: config.maxInstructionBytes,
        });
      }
      for (const entry of published.entries) {
        if (entry.serverName === config.serverName) entries.push(entry);
      }
    }

    const snapshot: RunMcpSnapshot = {
      catalogGeneration: published.generation,
      entries,
      serverInstructions,
      latchedServerNames,
    };

    if (entries.length) {
      const estimatedTokens = await estimateMcpDefinitionTokens(entries);
      if (estimatedTokens >= MCP_DEFINITIONS_TOKEN_WARN_THRESHOLD) {
        this.logger.warn(
          `MCP definitions token 估算偏高 | Run=${runId ?? 'unknown'} | generation=${snapshot.catalogGeneration} | tools=${entries.length} | estimatedTokens=${estimatedTokens}`,
        );
      }
    }

    return snapshot;
  }
}
