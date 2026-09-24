import { describe, expect, it, vi } from 'vitest';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

import { McpToolExecutor } from '../../../src/mcp/mcp-tool-executor';
import type { McpConnectionManager } from '../../../src/mcp/mcp-connection.manager';
import type { McpToolCatalogService } from '../../../src/mcp/mcp-tool-catalog.service';
import type { McpToolCatalogEntry, RunMcpSnapshot } from '../../../src/mcp/mcp.types';

const snapshot: RunMcpSnapshot = {
  catalogGeneration: 3,
  serverInstructions: [],
  latchedServerNames: ['demo'],
  entries: [
    {
      publicName: 'mcp__demo__ping',
      serverName: 'demo',
      rawName: 'ping',
      description: 'ping',
      parameters: { type: 'object', properties: {} },
      defaultApproval: 'require_approval',
      boundGeneration: 3,
      toolCallTimeoutMs: 5_000,
    },
  ],
};

function mockCatalog(entry?: McpToolCatalogEntry): McpToolCatalogService {
  return {
    lookupEntry: vi.fn((_name: string, snap?: RunMcpSnapshot) => {
      if (!entry) return undefined;
      if (snap && entry.boundGeneration !== snap.catalogGeneration) return entry;
      return entry;
    }),
  } as unknown as McpToolCatalogService;
}

function mockConnections(input: {
  generation?: number;
  client?: { callTool: ReturnType<typeof vi.fn> };
  runtime?: { status: string };
}): McpConnectionManager {
  return {
    getCatalogGeneration: vi.fn(() => input.generation ?? 3),
    getClient: vi.fn(() => input.client),
    getServerRuntime: vi.fn(() => input.runtime ?? { status: 'connected' }),
  } as unknown as McpConnectionManager;
}

describe('McpToolExecutor', () => {
  it('returns mcpCatalogStale when snapshot generation diverges from live', async () => {
    const entry = snapshot.entries[0]!;
    const executor = new McpToolExecutor(
      mockConnections({ generation: 4 }),
      mockCatalog(entry),
    );
    const result = await executor.execute('mcp__demo__ping', {}, { runId: 'r1', sessionId: 's1' }, snapshot);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe(AGENT_ERROR_CODES.mcpCatalogStale);
    }
  });

  it('returns mcpUnavailable when server is not connected', async () => {
    const entry = snapshot.entries[0]!;
    const executor = new McpToolExecutor(
      mockConnections({ generation: 3, runtime: { status: 'degraded' }, client: undefined }),
      mockCatalog(entry),
    );
    const result = await executor.execute('mcp__demo__ping', {}, { runId: 'r1', sessionId: 's1' }, snapshot);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe(AGENT_ERROR_CODES.mcpUnavailable);
    }
  });

  it('calls MCP client with raw tool name on success', async () => {
    const entry = snapshot.entries[0]!;
    const callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'pong' }] }));
    const executor = new McpToolExecutor(
      mockConnections({ generation: 3, client: { callTool }, runtime: { status: 'connected' } }),
      mockCatalog(entry),
    );
    const result = await executor.execute('mcp__demo__ping', {}, { runId: 'r1', sessionId: 's1' }, snapshot);
    expect(callTool).toHaveBeenCalledWith(
      { name: 'ping', arguments: {} },
      undefined,
      expect.objectContaining({ timeout: 5_000 }),
    );
    expect(result.status).toBe('succeeded');
  });
});
