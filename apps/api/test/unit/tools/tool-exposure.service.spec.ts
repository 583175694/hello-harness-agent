import { describe, expect, it } from 'vitest';

import { ToolExposureService } from '../../../src/tools/tool-exposure/tool-exposure.service';
import { ToolExposureConfigService } from '../../../src/tools/tool-exposure/tool-exposure.config';
import type { McpToolCatalogEntry, RunMcpSnapshot } from '../../../src/mcp/mcp.types';

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
      ToolExposureConfigService.forTest({ exposureMode: 'full' }),
    );
    const annotated = exposure.annotateSnapshot(snapshot([entry(1), entry(2)]));
    expect(annotated.entries.every((row) => row.exposure === 'direct')).toBe(true);
    expect(exposure.buildMcpDefinitions(annotated, new Set())).toHaveLength(2);
  });

  it('deferred_search applies directCap to non-whitelist servers', () => {
    const exposure = new ToolExposureService(
      ToolExposureConfigService.forTest({ exposureMode: 'deferred_search', directCap: 2 }),
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
      ToolExposureConfigService.forTest({ exposureMode: 'deferred_search', directCap: 1 }),
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
      ToolExposureConfigService.forTest({ exposureMode: 'deferred_search', directCap: 1 }),
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

  it('default policy uses deferred_search with directCap=0 so all non-whitelist tools are deferred', () => {
    const exposure = new ToolExposureService(new ToolExposureConfigService());
    const annotated = exposure.annotateSnapshot(snapshot([entry(1), entry(2), entry(3)]));
    expect(annotated.entries.every((row) => row.exposure === 'deferred')).toBe(true);
    expect(exposure.buildMcpDefinitions(annotated, new Set())).toHaveLength(0);
  });

  it('sorts direct definitions alphabetically and appends activated tools in insertion order', () => {
    const exposure = new ToolExposureService(
      ToolExposureConfigService.forTest({ exposureMode: 'deferred_search', directCap: 0 }),
    );
    const entries = [
      entry(2, 'white'),
      entry(1, 'white'),
      entry(3, 'other'),
      entry(1, 'other'),
    ];
    const annotated = exposure.annotateSnapshot(
      snapshot(entries, [
        { serverName: 'white', enabledTools: ['tool_1', 'tool_2'] },
        { serverName: 'other', enabledTools: null },
      ]),
    );
    const defs = exposure.buildMcpDefinitions(
      annotated,
      new Set(['mcp__other__tool_3', 'mcp__other__tool_1']),
    );
    expect(defs.map((d) => d.name)).toEqual([
      'mcp__white__tool_1',
      'mcp__white__tool_2',
      'mcp__other__tool_3',
      'mcp__other__tool_1',
    ]);
  });

  it('formatCapabilityManifest lists deferred servers in deterministic order with summaries', () => {
    const exposure = new ToolExposureService(new ToolExposureConfigService());
    const raw: RunMcpSnapshot = {
      catalogGeneration: 1,
      entries: [entry(1, 'tushareMcp'), entry(2, 'tushareMcp'), entry(1, 'Tinyfish')],
      serverInstructions: [
        {
          serverName: 'tushareMcp',
          text: 'China A-share financial data\nSecond line details',
          maxInstructionBytes: 1024,
        },
      ],
      latchedServerNames: ['tushareMcp', 'Tinyfish'],
      serverIcons: [],
      serverToolPolicy: [
        { serverName: 'tushareMcp', enabledTools: null },
        { serverName: 'Tinyfish', enabledTools: null },
      ],
    };
    const annotated = exposure.annotateSnapshot(raw);
    const manifest = exposure.formatCapabilityManifest(annotated);
    expect(manifest).toContain('- Tinyfish (1 tools): e.g. tool_1');
    expect(manifest).toContain('- tushareMcp (2 tools): China A-share financial data');
    expect(manifest.indexOf('Tinyfish')).toBeLessThan(manifest.indexOf('tushareMcp'));
  });
});
