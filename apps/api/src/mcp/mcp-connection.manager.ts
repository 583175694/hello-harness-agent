import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { createHash } from 'node:crypto';
import { AGENT_TOOL_NAMES, parseMcpIcons, type McpIcon } from '@harness/agent-protocol';
import { Client, StreamableHTTPClientTransport } from './mcp-sdk.client';
import type { McpDefaultApproval, McpServerConfig, McpServerSecret } from '@prisma/client';
import {
  McpServerConfigRepository,
  type McpServerConfigRecord,
} from './mcp-server-config.repository';
import { McpServerSecretsRepository } from './mcp-server-secrets.repository';
import { SecretsCryptoService } from './secrets-crypto.service';
import { publicToolName } from './mcp-public-tool-name';
import { formatLogDuration, shortLogId } from '../shared/logging.utils';
import { LatencyTrace } from '../shared/timing';
import type {
  McpPublishedCatalog,
  McpPublishedServerView,
  McpResolvedTransport,
  McpServerRuntimeStatus,
  McpToolCatalogEntry,
} from './mcp.types';

/** reconcile 总耗时达到该阈值时输出逐 server 分解，避免正常路径刷屏。 */
const RECONCILE_SLOW_LOG_THRESHOLD_MS = 1_000;

/** MCP 目录缓存 TTL（5 分钟）；到期后走 SWR：本次 Run 用旧快照秒开，后台异步刷新。 */
export const MCP_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

export type ReconcileResult = {
  mode: 'cache_hit' | 'swr_stale' | 'synced';
  configs: McpServerConfigRecord[];
  generation: number;
};

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
  serverIcons: McpIcon[];
  connection?: LiveConnection;
};

type ListedMcpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  icons?: unknown;
};

type UserMcpState = {
  catalogGeneration: number;
  published: McpPublishedCatalog;
  publishedContentHash: string | null;
  configFingerprint: string | null;
  reconciledAt: number | null;
  inFlightReconcile: Promise<void> | null;
  runtimeByServer: Map<string, ServerRuntimeState>;
};

@Injectable()
export class McpConnectionManager implements OnModuleInit, OnModuleDestroy {
  private readonly byUser = new Map<string, UserMcpState>();

  constructor(
    @Inject(McpServerConfigRepository) private readonly configs: McpServerConfigRepository,
    @Inject(McpServerSecretsRepository) private readonly secretsRepo: McpServerSecretsRepository,
    @Inject(SecretsCryptoService) private readonly crypto: SecretsCryptoService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    // 按 userId lazy reconcile；不在启动时绑定单一本地用户。
  }

  async onModuleDestroy(): Promise<void> {
    for (const userState of this.byUser.values()) {
      for (const state of userState.runtimeByServer.values()) {
        await this.closeConnection(state);
      }
      userState.runtimeByServer.clear();
    }
    this.byUser.clear();
  }

  private userState(userId: string): UserMcpState {
    let state = this.byUser.get(userId);
    if (!state) {
      state = {
        catalogGeneration: 0,
        published: emptyCatalog(0),
        publishedContentHash: null,
        configFingerprint: null,
        reconciledAt: null,
        inFlightReconcile: null,
        runtimeByServer: new Map(),
      };
      this.byUser.set(userId, state);
    }
    return state;
  }

  getCatalogGeneration(userId: string): number {
    return this.userState(userId).catalogGeneration;
  }

  getPublishedCatalog(userId: string): McpPublishedCatalog {
    return this.userState(userId).published;
  }

  getPublishedEntries(userId: string): McpToolCatalogEntry[] {
    return this.userState(userId).published.entries;
  }

  getServerRuntime(userId: string, serverName: string): ServerRuntimeState | undefined {
    return this.userState(userId).runtimeByServer.get(serverName);
  }

  getClient(userId: string, serverName: string): Client | undefined {
    return this.userState(userId).runtimeByServer.get(serverName)?.connection?.client;
  }

  async reconcile(
    userId: string,
    options?: { force?: boolean },
  ): Promise<ReconcileResult> {
    const userState = this.userState(userId);
    const configs = await this.configs.listEnabled(userId);
    const configFingerprint = computeEnabledConfigFingerprint(configs);
    const hasCache =
      userState.reconciledAt !== null && userState.configFingerprint === configFingerprint;
    const allRequiredReady = configs.every(
      (cfg) =>
        !cfg.required || userState.published.servers.get(cfg.serverName)?.status === 'connected',
    );

    if (!options?.force && hasCache && allRequiredReady) {
      const ageMs = Date.now() - userState.reconciledAt!;
      if (ageMs < MCP_CATALOG_CACHE_TTL_MS) {
        return { mode: 'cache_hit', configs, generation: userState.catalogGeneration };
      }
      // SWR：过期后先返回旧快照让本次 Run 零等待启动，同时触发 single-flight 后台异步刷新。
      if (!userState.inFlightReconcile) {
        this.startReconcileTask(userId, configs, configFingerprint).catch((error) => {
          this.logger.warn(
            `MCP 后台 SWR 刷新失败 | 用户=${shortLogId(userId)} | 原因=${error instanceof Error ? error.message : String(error)}`,
            McpConnectionManager.name,
          );
        });
      }
      return { mode: 'swr_stale', configs, generation: userState.catalogGeneration };
    }

    if (options?.force && userState.inFlightReconcile) {
      await userState.inFlightReconcile.catch(() => undefined);
    }
    if (!userState.inFlightReconcile) {
      await this.startReconcileTask(userId, configs, configFingerprint);
    } else {
      await userState.inFlightReconcile;
    }
    return { mode: 'synced', configs, generation: userState.catalogGeneration };
  }

  private startReconcileTask(
    userId: string,
    configs: McpServerConfigRecord[],
    configFingerprint: string,
  ): Promise<void> {
    const userState = this.userState(userId);
    const task = this.performReconcile(userId, configs, configFingerprint).finally(() => {
      if (userState.inFlightReconcile === task) {
        userState.inFlightReconcile = null;
      }
    });
    userState.inFlightReconcile = task;
    return task;
  }

  private async performReconcile(
    userId: string,
    configs: McpServerConfigRecord[],
    configFingerprint: string,
  ): Promise<void> {
    const userState = this.userState(userId);
    const runtimeByServer = userState.runtimeByServer;
    // reconcile 位于 Run 的模型请求前关键路径，逐 server 记录耗时才能解释首字等待。
    const trace = new LatencyTrace();
    const enabledNames = new Set(configs.map((c) => c.serverName));
    for (const name of [...runtimeByServer.keys()]) {
      if (!enabledNames.has(name)) {
        const state = runtimeByServer.get(name)!;
        await this.closeConnection(state);
        runtimeByServer.delete(name);
      }
    }

    const previousEntriesByServer = groupEntriesByServer(userState.published.entries);
    const perServerResults = await Promise.all(
      configs.map((config) =>
        this.reconcileSingleServer(config, runtimeByServer, previousEntriesByServer, trace),
      ),
    );

    const nextServers = new Map<string, McpPublishedServerView>();
    const rawEntries: McpToolCatalogEntry[] = [];
    const serverTimings: string[] = [];
    for (const item of perServerResults) {
      nextServers.set(item.view.serverName, item.view);
      rawEntries.push(...item.entries);
      serverTimings.push(item.timing);
    }

    const nextContentHash = computeCatalogContentHash(nextServers, rawEntries);
    const unchanged =
      userState.catalogGeneration > 0 && userState.publishedContentHash === nextContentHash;
    const finalGeneration = unchanged
      ? userState.catalogGeneration
      : userState.catalogGeneration + 1;
    const nextEntries = rawEntries.map((entry) => ({
      ...entry,
      boundGeneration: finalGeneration,
    }));

    userState.catalogGeneration = finalGeneration;
    userState.published = {
      generation: finalGeneration,
      servers: nextServers,
      entries: nextEntries,
    };
    userState.publishedContentHash = nextContentHash;
    userState.configFingerprint = configFingerprint;
    userState.reconciledAt = Date.now();

    // 慢 reconcile 直接推迟首字；使用 warn 级别让每次 Run 都可追踪（info 会被 pino 对重复消息去重）。
    const reconcileMs = trace.elapsedMs();
    const degraded = [...nextServers.values()].filter((view) => view.status !== 'connected');
    if (reconcileMs >= RECONCILE_SLOW_LOG_THRESHOLD_MS || degraded.length) {
      this.logger.warn(
        `MCP reconcile 偏慢 | 用户=${shortLogId(userId)} | servers=${configs.length} | tools=${nextEntries.length} | generation=${finalGeneration} | 耗时=${formatLogDuration(reconcileMs)} | 降级=${degraded.length ? degraded.map((view) => `${view.serverName}(${view.lastError ?? 'unknown'})`).join(',') : '无'} | 分解=${serverTimings.join(' ') || '无'}`,
        McpConnectionManager.name,
      );
    }
  }

  private async reconcileSingleServer(
    config: McpServerConfigRecord,
    runtimeByServer: Map<string, ServerRuntimeState>,
    previousEntriesByServer: Map<string, McpToolCatalogEntry[]>,
    trace: LatencyTrace,
  ): Promise<{
    view: McpPublishedServerView;
    entries: McpToolCatalogEntry[];
    timing: string;
  }> {
    const serverStartedAt = trace.elapsedMs();
    const prevTools = previousEntriesByServer.get(config.serverName) ?? [];
    let state = runtimeByServer.get(config.serverName);
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
        serverIcons: [],
      };
      runtimeByServer.set(config.serverName, state);
    } else {
      state.configId = config.id;
      state.required = config.required;
      state.defaultApproval = config.defaultApproval;
      state.enabledTools = parseStringList(config.enabledTools);
      state.disabledTools = parseStringList(config.disabledTools);
      state.toolCallTimeoutMs = config.toolCallTimeoutMs;
      state.serverIcons ??= [];
    }

    try {
      const serverTrace = new LatencyTrace();
      const transportConfig = await serverTrace.measure('凭证', () =>
        this.resolveTransport(config),
      );
      const fingerprint = this.transportFingerprint(config, transportConfig);
      await serverTrace.measure('连接', () =>
        this.ensureConnected(state, config, transportConfig, fingerprint),
      );
      const client = state.connection!.client;
      const tools = await serverTrace.measure('listTools', () =>
        this.listAllTools(client, config.startupTimeoutMs),
      );
      const filtered = filterTools(tools, state.enabledTools, state.disabledTools);
      const instructions = client.getInstructions()?.trim() || null;
      state.instructions = instructions;
      state.toolCountTotal = tools.length;
      const entries = filtered
        .map((tool) => toCatalogEntry(config, tool, 0, state.defaultApproval))
        .filter((entry) => entry.publicName !== AGENT_TOOL_NAMES.toolSearch);
      state.status = 'connected';
      state.lastError = null;
      return {
        view: {
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
          ...(state.serverIcons.length ? { serverIcons: state.serverIcons } : {}),
          tools: filtered.map((tool) => ({
            rawName: tool.name,
            description: tool.description ?? '',
            inputSchema: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object' },
          })),
        },
        entries,
        timing: `${config.serverName}:${formatLogDuration(trace.elapsedMs() - serverStartedAt)}(${serverTrace.formatSegments()} 工具=${tools.length})`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `MCP server ${config.serverName} reconcile 失败: ${detail}`,
        McpConnectionManager.name,
      );
      state.status = 'degraded';
      state.lastError = detail;
      const exposedCount = prevTools.length;
      const totalCount = state.toolCountTotal || exposedCount;
      if (prevTools.length) {
        return {
          view: {
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
            ...(state.serverIcons.length ? { serverIcons: state.serverIcons } : {}),
            tools: prevTools.map((entry) => ({
              rawName: entry.rawName,
              description: entry.description,
              inputSchema: entry.parameters,
            })),
          },
          entries: prevTools,
          timing: `${config.serverName}:${formatLogDuration(trace.elapsedMs() - serverStartedAt)}(失败)`,
        };
      }
      return {
        view: {
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
        },
        entries: [],
        timing: `${config.serverName}:${formatLogDuration(trace.elapsedMs() - serverStartedAt)}(失败)`,
      };
    }
  }

  async probeConfig(
    config: McpServerConfigRecord,
  ): Promise<{ toolNames: string[]; error: string | null }> {
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

  async removeServer(userId: string, serverName: string): Promise<void> {
    const userState = this.userState(userId);
    const state = userState.runtimeByServer.get(serverName);
    if (state) {
      await this.closeConnection(state);
      userState.runtimeByServer.delete(serverName);
    }
    userState.reconciledAt = null;
  }

  async invalidateServer(userId: string, serverName: string): Promise<void> {
    const userState = this.userState(userId);
    const state = userState.runtimeByServer.get(serverName);
    if (state) {
      await this.closeConnection(state);
      state.status = 'disconnected';
    }
    userState.reconciledAt = null;
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
        ? {
            maxRetries: config.reconnectMaxAttempts,
            maxReconnectionDelay: 30_000,
            initialReconnectionDelay: 1000,
            reconnectionDelayGrowFactor: 1.5,
          }
        : {
            maxRetries: 0,
            maxReconnectionDelay: 30_000,
            initialReconnectionDelay: 1000,
            reconnectionDelayGrowFactor: 1.5,
          },
    });
    await withTimeout(
      client.connect(transport),
      config.startupTimeoutMs,
      `连接 MCP server ${config.serverName} 超时`,
    );
    state.serverIcons = readServerIcons(client);
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
    const tools: ListedMcpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = (await withTimeout(
        client.listTools(cursor ? { cursor } : undefined),
        timeoutMs,
        'listTools 超时',
      )) as { tools?: ListedMcpTool[]; nextCursor?: string };
      tools.push(...(page.tools ?? []));
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }
}

function readServerIcons(client: Client): McpIcon[] {
  const info = (client as { getServerVersion?: () => { icons?: unknown } }).getServerVersion?.();
  return parseMcpIcons(info?.icons);
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

function filterTools(tools: ListedMcpTool[], enabled: string[] | null, disabled: string[] | null) {
  return tools.filter((tool) => {
    if (enabled?.length && !enabled.includes(tool.name)) return false;
    if (disabled?.includes(tool.name)) return false;
    return true;
  });
}

function toCatalogEntry(
  config: McpServerConfig,
  tool: ListedMcpTool,
  generation: number,
  defaultApproval: McpDefaultApproval,
): McpToolCatalogEntry {
  const parameters = (tool.inputSchema as Record<string, unknown>) ?? {
    type: 'object',
    properties: {},
  };
  const icons = parseMcpIcons(tool.icons);
  return {
    publicName: publicToolName(config.serverName, tool.name),
    serverName: config.serverName,
    rawName: tool.name,
    description: tool.description ?? '',
    parameters,
    defaultApproval,
    boundGeneration: generation,
    toolCallTimeoutMs: config.toolCallTimeoutMs,
    ...(icons.length ? { icons } : {}),
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

function computeEnabledConfigFingerprint(configs: ReadonlyArray<McpServerConfigRecord>): string {
  const normalized = [...configs]
    .sort((a, b) => a.serverName.localeCompare(b.serverName))
    .map((cfg) => ({
      id: cfg.id,
      serverName: cfg.serverName,
      url: cfg.url,
      headersPlain: cfg.headersPlain ?? null,
      enabledTools: cfg.enabledTools ?? null,
      disabledTools: cfg.disabledTools ?? null,
      required: cfg.required,
      defaultApproval: cfg.defaultApproval,
      toolCallTimeoutMs: cfg.toolCallTimeoutMs,
      maxInstructionBytes: cfg.maxInstructionBytes,
      updatedAt: cfg.updatedAt instanceof Date ? cfg.updatedAt.toISOString() : String(cfg.updatedAt ?? ''),
      secrets: (cfg.secrets ?? [])
        .map((s) =>
          'ciphertext' in s && typeof s.ciphertext === 'string'
            ? `${s.kind}:${s.name}:${s.ciphertext}`
            : `${s.kind}:${s.name}`,
        )
        .sort(),
    }));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function computeCatalogContentHash(
  servers: ReadonlyMap<string, McpPublishedServerView>,
  entries: ReadonlyArray<McpToolCatalogEntry>,
): string {
  const serverSummary = [...servers.values()]
    .sort((a, b) => a.serverName.localeCompare(b.serverName))
    .map((view) => ({
      serverName: view.serverName,
      status: view.status,
      instructions: view.instructions,
      defaultApproval: view.defaultApproval,
      enabledTools: view.enabledTools,
      disabledTools: view.disabledTools,
      toolCallTimeoutMs: view.toolCallTimeoutMs,
    }));
  const entrySummary = [...entries]
    .sort((a, b) => a.publicName.localeCompare(b.publicName))
    .map((entry) => ({
      publicName: entry.publicName,
      description: entry.description,
      parameters: entry.parameters,
      defaultApproval: entry.defaultApproval,
      toolCallTimeoutMs: entry.toolCallTimeoutMs,
    }));
  return createHash('sha256')
    .update(JSON.stringify({ servers: serverSummary, entries: entrySummary }))
    .digest('hex');
}
