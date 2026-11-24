import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from 'nestjs-pino';
import {
  MCP_CATALOG_CACHE_TTL_MS,
  McpConnectionManager,
} from '../../../src/mcp/mcp-connection.manager';
import type {
  McpServerConfigRecord,
  McpServerConfigRepository,
} from '../../../src/mcp/mcp-server-config.repository';
import type { McpServerSecretsRepository } from '../../../src/mcp/mcp-server-secrets.repository';
import type { SecretsCryptoService } from '../../../src/mcp/secrets-crypto.service';

const mockListTools = vi.fn();
const mockConnect = vi.fn();
const mockClose = vi.fn();

vi.mock('../../../src/mcp/mcp-sdk.client', () => ({
  Client: class MockClient {
    connect = mockConnect;
    close = mockClose;
    listTools = mockListTools;
    getInstructions = () => 'Demo instructions';
    getServerVersion = () => ({ icons: [] });
  },
  StreamableHTTPClientTransport: class MockTransport {
    constructor(
      public readonly url: URL,
      public readonly opts: unknown,
    ) {}
  },
}));

function makeConfig(overrides: Partial<McpServerConfigRecord> = {}): McpServerConfigRecord {
  return {
    id: 'cfg-1',
    userId: 'u1',
    serverName: 'demo',
    enabled: true,
    url: 'https://demo.example.com/mcp',
    headersPlain: null,
    startupTimeoutMs: 5_000,
    toolCallTimeoutMs: 30_000,
    required: false,
    failOnStartupError: false,
    defaultApproval: 'auto_execute',
    enabledTools: null,
    disabledTools: null,
    maxInstructionBytes: 4096,
    reconnectEnabled: true,
    reconnectMaxAttempts: 2,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    secrets: [],
    ...overrides,
  } as unknown as McpServerConfigRecord;
}

function createManager(configs: McpServerConfigRecord[]) {
  const configsRepo = {
    listEnabled: vi.fn(async () => configs),
  } as unknown as McpServerConfigRepository;
  const secretsRepo = {
    decryptAll: vi.fn(async () => []),
  } as unknown as McpServerSecretsRepository;
  const crypto = {
    canEncrypt: vi.fn(() => true),
  } as unknown as SecretsCryptoService;
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
  return {
    manager: new McpConnectionManager(configsRepo, secretsRepo, crypto, logger),
    configsRepo,
  };
}

describe('McpConnectionManager SWR cache & parallel reconcile', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns cache_hit within TTL without calling listTools again', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockListTools.mockResolvedValue({
      tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object' } }],
    });

    const { manager } = createManager([makeConfig()]);

    const first = await manager.reconcile('u1');
    expect(first.mode).toBe('synced');
    expect(first.generation).toBe(1);
    expect(mockListTools).toHaveBeenCalledTimes(1);

    const second = await manager.reconcile('u1');
    expect(second.mode).toBe('cache_hit');
    expect(second.generation).toBe(1);
    expect(mockListTools).toHaveBeenCalledTimes(1);
  });

  it('uses SWR on TTL expiry and preserves generation when tool catalog content is unchanged', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));

    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockListTools.mockResolvedValue({
      tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object' } }],
    });

    const { manager } = createManager([makeConfig()]);
    await manager.reconcile('u1');
    expect(manager.getCatalogGeneration('u1')).toBe(1);

    // Advance past 5-minute TTL
    vi.advanceTimersByTime(MCP_CATALOG_CACHE_TTL_MS + 1_000);

    // Two concurrent SWR calls should return immediately and trigger only ONE background refresh
    const [r1, r2] = await Promise.all([manager.reconcile('u1'), manager.reconcile('u1')]);
    expect(r1.mode).toBe('swr_stale');
    expect(r2.mode).toBe('swr_stale');

    // Flush microtasks for background refresh
    await vi.waitFor(() => {
      expect(mockListTools).toHaveBeenCalledTimes(2);
    });
    // Content hash unchanged -> generation stays 1 (no mcpCatalogStale for in-flight Runs)
    expect(manager.getCatalogGeneration('u1')).toBe(1);

    // Now simulate upstream adding a new tool and force refresh -> generation bumps to 2
    mockListTools.mockResolvedValue({
      tools: [
        { name: 'ping', description: 'Ping', inputSchema: { type: 'object' } },
        { name: 'pong', description: 'Pong', inputSchema: { type: 'object' } },
      ],
    });
    const forced = await manager.reconcile('u1', { force: true });
    expect(forced.mode).toBe('synced');
    expect(forced.generation).toBe(2);
  });

  it('reconciles multiple servers in parallel', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    let activeCount = 0;
    let maxConcurrency = 0;
    mockListTools.mockImplementation(async () => {
      activeCount += 1;
      maxConcurrency = Math.max(maxConcurrency, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 30));
      activeCount -= 1;
      return { tools: [{ name: 't1', description: 'd', inputSchema: { type: 'object' } }] };
    });

    const { manager } = createManager([
      makeConfig({ id: 'c1', serverName: 'srv_a', url: 'https://a.example.com/mcp' }),
      makeConfig({ id: 'c2', serverName: 'srv_b', url: 'https://b.example.com/mcp' }),
    ]);

    await manager.reconcile('u1');
    expect(maxConcurrency).toBe(2);
  });

  it('invalidateServer clears cache so next reconcile reconnects synchronously', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockListTools.mockResolvedValue({
      tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object' } }],
    });

    const { manager } = createManager([makeConfig()]);
    await manager.reconcile('u1');
    expect(mockListTools).toHaveBeenCalledTimes(1);

    await manager.invalidateServer('u1', 'demo');
    const next = await manager.reconcile('u1');
    expect(next.mode).toBe('synced');
    expect(mockListTools).toHaveBeenCalledTimes(2);
  });
});
