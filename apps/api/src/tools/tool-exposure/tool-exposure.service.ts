import { Inject, Injectable } from '@nestjs/common';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import type { AgentToolDefinition } from '../agent-tool.types';
import type { McpToolCatalogEntry, RunMcpSnapshot } from '../../mcp/mcp.types';
import type { ToolPhase } from '../../agent-runtime/tool-turn-budget';
import { ToolExposureConfigService } from './tool-exposure.config';
import { DeferredToolSearchIndex } from './deferred-tool-search-index';

export type ToolExposureMetrics = {
  latchedToolCount: number;
  deferredCount: number;
  activatedCount: number;
  exposedToolCount: number;
};

@Injectable()
export class ToolExposureService {
  constructor(@Inject(ToolExposureConfigService) private readonly config: ToolExposureConfigService) {}

  annotateSnapshot(snapshot: RunMcpSnapshot): RunMcpSnapshot {
    const policyByServer = new Map(
      snapshot.serverToolPolicy.map((row) => [row.serverName, row.enabledTools] as const),
    );
    const mode = this.config.exposureMode;
    const cap = this.config.directCap;
    let directSlots = cap;

    const entries: McpToolCatalogEntry[] = snapshot.entries.map((entry) => {
      if (mode === 'full') {
        return { ...entry, exposure: 'direct' as const };
      }
      const enabledTools = policyByServer.get(entry.serverName);
      if (enabledTools != null) {
        return { ...entry, exposure: 'direct' as const };
      }
      if (directSlots > 0) {
        directSlots -= 1;
        return { ...entry, exposure: 'direct' as const };
      }
      return { ...entry, exposure: 'deferred' as const };
    });

    return { ...snapshot, entries };
  }

  createIndex(snapshot: RunMcpSnapshot | undefined): DeferredToolSearchIndex | null {
    if (!snapshot?.entries.length) return null;
    const deferred = snapshot.entries.filter((entry) => entry.exposure === 'deferred');
    if (!deferred.length) return null;
    return new DeferredToolSearchIndex(deferred);
  }

  deferredCount(snapshot: RunMcpSnapshot | undefined): number {
    return snapshot?.entries.filter((entry) => entry.exposure === 'deferred').length ?? 0;
  }

  buildMcpDefinitions(
    snapshot: RunMcpSnapshot | undefined,
    activatedTools: ReadonlySet<string> | undefined,
  ): AgentToolDefinition[] {
    if (!snapshot?.entries.length) return [];
    const activated = activatedTools ?? new Set<string>();
    return snapshot.entries
      .filter(
        (entry) => entry.exposure === 'direct' || activated.has(entry.publicName),
      )
      .map((entry) => ({
        name: entry.publicName,
        description: entry.description || `MCP tool ${entry.rawName} on ${entry.serverName}`,
        parameters: entry.parameters,
      }));
  }

  shouldInjectToolSearch(input: {
    deferredCount: number;
    toolPhase: ToolPhase;
  }): boolean {
    if (!this.config.toolSearchEnabled) return false;
    if (input.deferredCount <= 0) return false;
    if (input.toolPhase === 'final_only' || input.toolPhase === 'delivery') return false;
    return true;
  }

  toolSearchDefinition(): AgentToolDefinition {
    const defaultLimit = this.config.toolSearchDefaultLimit;
    return {
      name: AGENT_TOOL_NAMES.toolSearch,
      description:
        'Search deferred MCP tools by natural language. Use an English query. Returns matching tool definitions (name, description, parameters). Call a returned tool by its exact name in a follow-up function_call.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "What capability you need, e.g. 'create calendar event' or 'query database'.",
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 16,
            default: defaultLimit,
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    };
  }

  canExecuteMcp(
    publicName: string,
    snapshot: RunMcpSnapshot | undefined,
    activatedTools: ReadonlySet<string> | undefined,
  ): boolean {
    if (this.config.exposureMode === 'full') return true;
    const entry = snapshot?.entries.find((item) => item.publicName === publicName);
    if (!entry) return true;
    if (entry.exposure === 'direct') return true;
    return activatedTools?.has(publicName) ?? false;
  }

  exposureMetrics(input: {
    snapshot: RunMcpSnapshot | undefined;
    activatedTools: ReadonlySet<string>;
    exposedDefinitions: ReadonlyArray<{ name: string }> | undefined;
  }): ToolExposureMetrics {
    const latchedToolCount = input.snapshot?.entries.length ?? 0;
    const deferredCount = this.deferredCount(input.snapshot);
    const activatedCount = input.activatedTools.size;
    const exposedToolCount = input.exposedDefinitions?.length ?? 0;
    return { latchedToolCount, deferredCount, activatedCount, exposedToolCount };
  }
}
