import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { shortLogId } from '../shared/logging.utils';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { McpServerConfigRepository } from './mcp-server-config.repository';
import { McpConnectionManager } from './mcp-connection.manager';
import type {
  McpServerIconSnapshot,
  McpServerInstructionSnapshot,
  McpServerToolPolicySnapshot,
  McpToolCatalogEntry,
  RunMcpSnapshot,
} from './mcp.types';
import {
  estimateMcpDefinitionTokens,
  MCP_DEFINITIONS_TOKEN_WARN_THRESHOLD,
} from './mcp-latch-observability';

@Injectable()
export class McpRunLatchService {
  constructor(
    @Inject(McpServerConfigRepository) private readonly configs: McpServerConfigRepository,
    @Inject(McpConnectionManager) private readonly connections: McpConnectionManager,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  async captureForUser(userId: string, runId?: string): Promise<RunMcpSnapshot> {
    await this.connections.reconcile(userId);
    const enabled = await this.configs.listEnabled(userId);
    const published = this.connections.getPublishedCatalog(userId);
    const entries: McpToolCatalogEntry[] = [];
    const serverInstructions: McpServerInstructionSnapshot[] = [];
    const latchedServerNames: string[] = [];
    const serverIcons: McpServerIconSnapshot[] = [];
    const serverToolPolicy: McpServerToolPolicySnapshot[] = [];

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
      serverToolPolicy.push({
        serverName: config.serverName,
        enabledTools: parseEnabledToolsList(config.enabledTools),
      });
      if (view.serverIcons?.length) {
        serverIcons.push({ serverName: config.serverName, icons: view.serverIcons });
      }
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
      serverIcons,
      serverToolPolicy,
    };

    if (entries.length) {
      const estimatedTokens = await estimateMcpDefinitionTokens(entries);
      if (estimatedTokens >= MCP_DEFINITIONS_TOKEN_WARN_THRESHOLD) {
        this.logger.warn(
          `MCP definitions token 估算偏高 | Run=${shortLogId(runId ?? 'unknown')} | generation=${snapshot.catalogGeneration} | tools=${entries.length} | estimatedTokens=${estimatedTokens}`,
          McpRunLatchService.name,
        );
      }
    }

    return snapshot;
  }
}

function parseEnabledToolsList(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const list = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return list.length ? list : null;
  }
  return null;
}
