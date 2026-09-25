import { describe, expect, it, vi } from 'vitest';

import { McpToolCatalogService } from '../../../src/mcp/mcp-tool-catalog.service';
import type { McpConnectionManager } from '../../../src/mcp/mcp-connection.manager';
import type { McpToolCatalogEntry, RunMcpSnapshot } from '../../../src/mcp/mcp.types';

function entry(overrides: Partial<McpToolCatalogEntry> = {}): McpToolCatalogEntry {
  return {
    publicName: 'mcp__demo__ping',
    serverName: 'demo',
    rawName: 'ping',
    description: 'ping',
    parameters: { type: 'object', properties: {} },
    defaultApproval: 'require_approval',
    boundGeneration: 2,
    toolCallTimeoutMs: 60_000,
    ...overrides,
  };
}

describe('McpToolCatalogService', () => {
  it('reads live generation from connection manager', () => {
    const connections = {
      getCatalogGeneration: vi.fn(() => 5),
      getPublishedEntries: vi.fn(() => []),
    } as unknown as McpConnectionManager;
    const catalog = new McpToolCatalogService(connections);
    expect(catalog.getLiveGeneration('local-user')).toBe(5);
  });

  it('definitionsForRun prefers frozen snapshot entries', () => {
    const live = entry({ publicName: 'mcp__live__tool', boundGeneration: 9 });
    const frozen = entry({ publicName: 'mcp__demo__ping', boundGeneration: 2 });
    const snapshot: RunMcpSnapshot = {
      catalogGeneration: 2,
      serverInstructions: [],
      latchedServerNames: ['demo'],
      entries: [frozen],
    };
    const connections = {
      getCatalogGeneration: vi.fn(() => 9),
      getPublishedEntries: vi.fn(() => [live]),
    } as unknown as McpConnectionManager;
    const catalog = new McpToolCatalogService(connections);
    const defs = catalog.definitionsForRun(snapshot, 'local-user');
    expect(defs).toHaveLength(1);
    expect(defs[0]?.name).toBe('mcp__demo__ping');
    expect(connections.getPublishedEntries).not.toHaveBeenCalled();
  });

  it('lookupEntry resolves by public name within snapshot', () => {
    const frozen = entry();
    const connections = {
      getCatalogGeneration: vi.fn(),
      getPublishedEntries: vi.fn(() => []),
    } as unknown as McpConnectionManager;
    const catalog = new McpToolCatalogService(connections);
    expect(
      catalog.lookupEntry(
        'mcp__demo__ping',
        {
          catalogGeneration: 2,
          serverInstructions: [],
          latchedServerNames: ['demo'],
          entries: [frozen],
        },
        'local-user',
      ),
    ).toEqual(frozen);
    expect(catalog.lookupEntry('missing', undefined, 'local-user')).toBeUndefined();
  });
});
