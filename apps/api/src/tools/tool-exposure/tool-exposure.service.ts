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
      if (
        enabledTools != null &&
        (enabledTools.length === 0 || enabledTools.includes(entry.rawName))
      ) {
        return { ...entry, exposure: 'direct' as const };
      }
      if (directSlots > 0) {
        directSlots -= 1;
        return { ...entry, exposure: 'direct' as const };
      }
      return { ...entry, exposure: 'deferred' as const };
    });

    entries.sort((a, b) => a.publicName.localeCompare(b.publicName));
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
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  formatCapabilityManifest(snapshot: RunMcpSnapshot | undefined): string {
    if (!snapshot?.entries.length) return '';
    const deferredByServer = new Map<string, McpToolCatalogEntry[]>();
    for (const entry of snapshot.entries) {
      if (entry.exposure !== 'deferred') continue;
      const list = deferredByServer.get(entry.serverName) ?? [];
      list.push(entry);
      deferredByServer.set(entry.serverName, list);
    }
    if (deferredByServer.size === 0) return '';

    const instructionsByServer = new Map(
      snapshot.serverInstructions.map((row) => [row.serverName, row.text] as const),
    );
    const serverNames = [...deferredByServer.keys()].sort((a, b) => a.localeCompare(b));
    const lines = serverNames.map((serverName) => {
      const entries = deferredByServer.get(serverName) ?? [];
      const summary = summarizeServerCapability(
        instructionsByServer.get(serverName),
        entries,
      );
      return `- ${serverName} (${entries.length} tools): ${summary}`;
    });

    return [
      '## Extended MCP Tool Capabilities (Deferred)',
      'The following MCP services are available via tool_search:',
      ...lines,
      'Call tool_search with concise keywords (English or Chinese) or exact tool name to discover and activate specific tools before calling them.',
    ].join('\n');
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
        'Search deferred MCP tools by natural language keywords (English or Chinese) or exact tool name. Returns matching tool definitions (name, description, parameters). Call a returned tool by its exact name in a follow-up function_call.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "What capability you need, e.g. 'index daily quotes', 'create calendar event', or exact tool name.",
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 8,
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

function summarizeServerCapability(
  instruction: string | undefined,
  entries: ReadonlyArray<McpToolCatalogEntry>,
): string {
  const firstLine = instruction
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine) {
    return firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine;
  }
  const samples = entries
    .slice(0, 4)
    .map((e) => e.rawName)
    .join(', ');
  return samples ? `e.g. ${samples}` : 'extended MCP tools';
}
