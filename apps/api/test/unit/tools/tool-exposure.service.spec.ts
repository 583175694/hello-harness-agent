import { describe, expect, it } from 'vitest';

import { ToolExposureService } from '../../../src/tools/tool-exposure/tool-exposure.service';
import { ToolExposureConfigService } from '../../../src/tools/tool-exposure/tool-exposure.config';
import type { ConfigService } from '@nestjs/config';
import type { McpToolCatalogEntry, RunMcpSnapshot } from '../../../src/mcp/mcp.types';

function configService(overrides: Record<string, string | undefined> = {}): ConfigService {
  return {
    get: (key: string) => overrides[key],
  } as unknown as ConfigService;
}

function entry(index: number, server = 'srv'): McpToolCatalogEntry {
  return {
    publicName: `mcp__${server}__tool_${index}`,
    serverName: server,
    rawName: `tool_${index}`,
    description: `tool ${index}`,
    parameters: { type: 'object', properties: {} },
    defaultApproval: 'auto_execute',
    boundGeneration: 1,
    toolCallTimeoutMs: 60_000,
  };
}

function snapshot(
  entries: McpToolCatalogEntry[],
  policy: RunMcpSnapshot['serverToolPolicy'] = [{ serverName: 'srv', enabledTools: null }],
): RunMcpSnapshot {
  return {
    catalogGeneration: 1,
    entries,
    serverInstructions: [],
    latchedServerNames: ['srv'],
    serverIcons: [],
    serverToolPolicy: policy,
  };
}

describe('ToolExposureService', () => {
  it('full mode marks every MCP entry direct', () => {
    const exposure = new ToolExposureService(
      new ToolExposureConfigService(configService({ MCP_TOOL_EXPOSURE_MODE: 'full' })),
    );
    const annotated = exposure.annotateSnapshot(snapshot([entry(1), entry(2)]));
    expect(annotated.entries.every((row) => row.exposure === 'direct')).toBe(true);
    expect(exposure.buildMcpDefinitions(annotated, new Set())).toHaveLength(2);
  });

  it('deferred_search applies MCP_DIRECT_CAP to non-whitelist servers', () => {
    const exposure = new ToolExposureService(
      new ToolExposureConfigService(
        configService({ MCP_TOOL_EXPOSURE_MODE: 'deferred_search', MCP_DIRECT_CAP: '2' }),
      ),
    );
    const annotated = exposure.annotateSnapshot(snapshot([entry(1), entry(2), entry(3), entry(4)]));
    const direct = annotated.entries.filter((row) => row.exposure === 'direct');
    const deferred = annotated.entries.filter((row) => row.exposure === 'deferred');
    expect(direct).toHaveLength(2);
    expect(deferred).toHaveLength(2);
    expect(exposure.buildMcpDefinitions(annotated, new Set())).toHaveLength(2);
  });

  it('enabledTools whitelist server keeps all tools direct even over cap', () => {
    const exposure = new ToolExposureService(
      new ToolExposureConfigService(
        configService({ MCP_TOOL_EXPOSURE_MODE: 'deferred_search', MCP_DIRECT_CAP: '1' }),
      ),
    );
    const entries = [entry(1, 'white'), entry(2, 'white'), entry(3, 'other')];
    const annotated = exposure.annotateSnapshot(
      snapshot(entries, [
        { serverName: 'white', enabledTools: ['tool_1', 'tool_2'] },
        { serverName: 'other', enabledTools: null },
      ]),
    );
    const white = annotated.entries.filter((row) => row.serverName === 'white');
    expect(white.every((row) => row.exposure === 'direct')).toBe(true);
    const other = annotated.entries.find((row) => row.serverName === 'other');
    expect(other?.exposure).toBe('direct');
  });

  it('exposureMetrics reports latch/deferred/activated/exposed counts', () => {
    const exposure = new ToolExposureService(
      new ToolExposureConfigService(
        configService({ MCP_TOOL_EXPOSURE_MODE: 'deferred_search', MCP_DIRECT_CAP: '1' }),
      ),
    );
    const annotated = exposure.annotateSnapshot(snapshot([entry(1), entry(2), entry(3)]));
    const metrics = exposure.exposureMetrics({
      snapshot: annotated,
      activatedTools: new Set(['mcp__srv__tool_3']),
      exposedDefinitions: [{ name: 'read_file' }, { name: 'mcp__srv__tool_1' }],
    });
    expect(metrics.latchedToolCount).toBe(3);
    expect(metrics.deferredCount).toBeGreaterThan(0);
    expect(metrics.activatedCount).toBe(1);
    expect(metrics.exposedToolCount).toBe(2);
  });
});
