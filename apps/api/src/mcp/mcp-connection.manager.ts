import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from './mcp-sdk.client';
import type { McpDefaultApproval, McpServerConfig, McpServerSecret } from '@prisma/client';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { McpServerConfigRepository, type McpServerConfigRecord } from './mcp-server-config.repository';
import { McpServerSecretsRepository } from './mcp-server-secrets.repository';
import { SecretsCryptoService } from './secrets-crypto.service';
import { publicToolName } from './mcp-public-tool-name';
import type {
  McpPublishedCatalog,
  McpPublishedServerView,
  McpResolvedTransport,
  McpServerRuntimeStatus,
  McpToolCatalogEntry,
} from './mcp.types';

type LiveConnection = {
  client: Client;
  transport: StreamableHTTPClientTransport;
  fingerprint: string;
  configId: string;
};

type ServerRuntimeState = {
  serverName: string;
  configId: string;
  required: boolean;
  defaultApproval: McpDefaultApproval;
  enabledTools: string[] | null;
  disabledTools: string[] | null;
  toolCallTimeoutMs: number;
  status: McpServerRuntimeStatus;
  lastError: string | null;
  instructions: string | null;
  toolCountTotal: number;
  connection?: LiveConnection;
};

@Injectable()
export class McpConnectionManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpConnectionManager.name);
  private catalogGeneration = 0;
  private published: McpPublishedCatalog = emptyCatalog(0);
  private readonly runtimeByServer = new Map<string, ServerRuntimeState>();

  constructor(
    @Inject(McpServerConfigRepository) private readonly configs: McpServerConfigRepository,
    @Inject(McpServerSecretsRepository) private readonly secretsRepo: McpServerSecretsRepository,
    @Inject(SecretsCryptoService) private readonly crypto: SecretsCryptoService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reconcile(LOCAL_USER_ID).catch((error) => {
      this.logger.warn(`MCP 启动 reconcile 失败: ${String(error)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const state of this.runtimeByServer.values()) {
      await this.closeConnection(state);
    }
    this.runtimeByServer.clear();
  }

  getCatalogGeneration(): number {
    return this.catalogGeneration;
  }

  getPublishedCatalog(): McpPublishedCatalog {
    return this.published;
  }

  getPublishedEntries(): McpToolCatalogEntry[] {
    return this.published.entries;
  }

  getServerRuntime(serverName: string): ServerRuntimeState | undefined {
    return this.runtimeByServer.get(serverName);
  }

  getClient(serverName: string): Client | undefined {
    return this.runtimeByServer.get(serverName)?.connection?.client;
  }

  async reconcile(userId: string = LOCAL_USER_ID): Promise<void> {
    const configs = await this.configs.listEnabled(userId);
    const enabledNames = new Set(configs.map((c) => c.serverName));
    for (const name of [...this.runtimeByServer.keys()]) {
      if (!enabledNames.has(name)) {
        const state = this.runtimeByServer.get(name)!;
        await this.closeConnection(state);
        this.runtimeByServer.delete(name);
      }
    }

    const previousEntriesByServer = groupEntriesByServer(this.published.entries);
    const nextServers = new Map<string, McpPublishedServerView>();
    const nextEntries: McpToolCatalogEntry[] = [];
    const nextGeneration = this.catalogGeneration + 1;

    for (const config of configs) {
      const prevTools = previousEntriesByServer.get(config.serverName) ?? [];
      let state = this.runtimeByServer.get(config.serverName);
      if (!state) {
        state = {
          serverName: config.serverName,
          configId: config.id,
          required: config.required,
          defaultApproval: config.defaultApproval,
          enabledTools: parseStringList(config.enabledTools),
          disabledTools: parseStringList(config.disabledTools),
          toolCallTimeoutMs: config.toolCallTimeoutMs,
          status: 'disconnected',
          lastError: null,
          instructions: null,
          toolCountTotal: 0,
        };
        this.runtimeByServer.set(config.serverName, state);
      } else {
        state.configId = config.id;
        state.required = config.required;
        state.defaultApproval = config.defaultApproval;
        state.enabledTools = parseStringList(config.enabledTools);
        state.disabledTools = parseStringList(config.disabledTools);
        state.toolCallTimeoutMs = config.toolCallTimeoutMs;
      }

      try {
        const transportConfig = await this.resolveTransport(config);
        const fingerprint = this.transportFingerprint(config, transportConfig);
        await this.ensureConnected(state, config, transportConfig, fingerprint);
        const client = state.connection!.client;
        const tools = await this.listAllTools(client, config.startupTimeoutMs);
        const filtered = filterTools(tools, state.enabledTools, state.disabledTools);
        const instructions = client.getInstructions()?.trim() || null;
        state.instructions = instructions;
        state.toolCountTotal = tools.length;
        const entries = filtered.map((tool) =>
          toCatalogEntry(config, tool, nextGeneration, state!.defaultApproval),
        );
        nextEntries.push(...entries);
        nextServers.set(config.serverName, {
          configId: config.id,
          serverName: config.serverName,
          required: config.required,
          defaultApproval: config.defaultApproval,
          enabledTools: state.enabledTools,
          disabledTools: state.disabledTools,
          toolCallTimeoutMs: config.toolCallTimeoutMs,
          status: 'connected',
          lastError: null,
          toolCountTotal: tools.length,
          toolCountExposed: filtered.length,
          instructions,
          tools: filtered.map((tool) => ({
            rawName: tool.name,
            description: tool.description ?? '',
            inputSchema: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object' },
          })),
        });
        state.status = 'connected';
        state.lastError = null;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`MCP server ${config.serverName} reconcile 失败: ${detail}`);
        state.status = 'degraded';
        state.lastError = detail;
        const exposedCount = prevTools.length;
        const totalCount = state.toolCountTotal || exposedCount;
        if (prevTools.length) {
          nextEntries.push(...prevTools.map((entry) => ({ ...entry, boundGeneration: nextGeneration })));
          nextServers.set(config.serverName, {
            configId: config.id,
            serverName: config.serverName,
            required: config.required,
            defaultApproval: config.defaultApproval,
            enabledTools: state.enabledTools,
            disabledTools: state.disabledTools,
            toolCallTimeoutMs: config.toolCallTimeoutMs,
            status: 'degraded',
            lastError: detail,
            toolCountTotal: totalCount,
            toolCountExposed: exposedCount,
            instructions: state.instructions,
            tools: prevTools.map((entry) => ({
              rawName: entry.rawName,
              description: entry.description,
              inputSchema: entry.parameters,
            })),
          });
        } else {
          nextServers.set(config.serverName, {
            configId: config.id,
            serverName: config.serverName,
            required: config.required,
            defaultApproval: config.defaultApproval,
            enabledTools: state.enabledTools,
            disabledTools: state.disabledTools,
            toolCallTimeoutMs: config.toolCallTimeoutMs,
            status: 'degraded',
            lastError: detail,
            toolCountTotal: 0,
            toolCountExposed: 0,
            instructions: state.instructions,
            tools: [],
          });
        }
      }
    }

    this.catalogGeneration = nextGeneration;
    this.published = { generation: nextGeneration, servers: nextServers, entries: nextEntries };
  }

  async probeConfig(config: McpServerConfigRecord): Promise<{ toolNames: string[]; error: string | null }> {
    try {
      const transportConfig = await this.resolveTransport(config);
      const client = new Client({ name: 'harness-mcp-probe', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(transportConfig.url), {
        requestInit: { headers: transportConfig.headers },
      });
      await client.connect(transport);
      const tools = await this.listAllTools(client, config.startupTimeoutMs);
      await client.close();
      return { toolNames: tools.map((tool) => tool.name), error: null };
    } catch (error) {
      return { toolNames: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async removeServer(serverName: string): Promise<void> {
    const state = this.runtimeByServer.get(serverName);
    if (state) {
      await this.closeConnection(state);
      this.runtimeByServer.delete(serverName);
    }
  }

  private async ensureConnected(
    state: ServerRuntimeState,
    config: McpServerConfigRecord,
    transportConfig: McpResolvedTransport,
    fingerprint: string,
  ): Promise<void> {
    if (state.connection && state.connection.fingerprint === fingerprint) return;
    await this.closeConnection(state);
    const client = new Client({ name: 'harness-mcp-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(transportConfig.url), {
      requestInit: { headers: transportConfig.headers },
      reconnectionOptions: config.reconnectEnabled
        ? { maxRetries: config.reconnectMaxAttempts, maxReconnectionDelay: 30_000, initialReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1.5 }
        : { maxRetries: 0, maxReconnectionDelay: 30_000, initialReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1.5 },
    });
    await withTimeout(
      client.connect(transport),
      config.startupTimeoutMs,
      `连接 MCP server ${config.serverName} 超时`,
    );
    state.connection = { client, transport, fingerprint, configId: config.id };
  }

  private async closeConnection(state: ServerRuntimeState): Promise<void> {
    if (!state.connection) return;
    try {
      await state.connection.client.close();
    } catch {
      /* ignore */
    }
    state.connection = undefined;
  }

  private async resolveTransport(config: McpServerConfigRecord): Promise<McpResolvedTransport> {
    const headers: Record<string, string> = {};
    const plain = (config.headersPlain ?? {}) as Record<string, string>;
    for (const [key, value] of Object.entries(plain)) {
      if (typeof value === 'string') headers[key] = value;
    }
    const needsSecrets = config.secrets.some((s) => 'ciphertext' in s);
    if (needsSecrets && !this.crypto.canEncrypt()) {
      throw new Error('缺少 HARNESS_SECRETS_MASTER_KEY，无法解密 MCP 凭证');
    }
    const decrypted = await this.secretsRepo.decryptAll(
      config.secrets.filter((s): s is McpServerSecret => 'ciphertext' in s),
    );
    for (const secret of decrypted) {
      if (secret.kind === 'bearer') {
        headers.Authorization = headers.Authorization ?? `Bearer ${secret.value}`;
      } else if (secret.kind === 'header') {
        headers[secret.name] = secret.value;
      }
    }
    return { url: config.url, headers };
  }

  private transportFingerprint(config: McpServerConfig, transport: McpResolvedTransport): string {
    const secretValues = Object.values(transport.headers).sort();
    const payload = JSON.stringify({
      url: config.url,
      headersPlain: config.headersPlain,
      secrets: secretValues,
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  private async listAllTools(client: Client, timeoutMs: number) {
    const tools: Array<{ name: string; description?: string; inputSchema?: unknown }> = [];
    let cursor: string | undefined;
    do {
      const page = (await withTimeout(
        client.listTools(cursor ? { cursor } : undefined),
        timeoutMs,
        'listTools 超时',
      )) as { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>; nextCursor?: string };
      tools.push(...(page.tools ?? []));
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }
}

function emptyCatalog(generation: number): McpPublishedCatalog {
  return { generation, servers: new Map(), entries: [] };
}

function groupEntriesByServer(entries: McpToolCatalogEntry[]): Map<string, McpToolCatalogEntry[]> {
  const map = new Map<string, McpToolCatalogEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.serverName) ?? [];
    list.push(entry);
    map.set(entry.serverName, list);
  }
  return map;
}

function parseStringList(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  return null;
}

function filterTools(
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>,
  enabled: string[] | null,
  disabled: string[] | null,
) {
  return tools.filter((tool) => {
    if (enabled?.length && !enabled.includes(tool.name)) return false;
    if (disabled?.includes(tool.name)) return false;
    return true;
  });
}

function toCatalogEntry(
  config: McpServerConfig,
  tool: { name: string; description?: string; inputSchema?: unknown },
  generation: number,
  defaultApproval: McpDefaultApproval,
): McpToolCatalogEntry {
  const parameters = (tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} };
  return {
    publicName: publicToolName(config.serverName, tool.name),
    serverName: config.serverName,
    rawName: tool.name,
    description: tool.description ?? '',
    parameters,
    defaultApproval,
    boundGeneration: generation,
    toolCallTimeoutMs: config.toolCallTimeoutMs,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
