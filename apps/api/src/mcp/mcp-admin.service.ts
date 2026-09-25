import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  type McpCreateServerRequest,
  type McpPatchServerRequest,
  type McpServerListResponse,
  type McpServerTestResponse,
  type McpServerView,
  type McpUpdateServerRequest,
} from '@harness/agent-protocol';
import { Prisma } from '@prisma/client';
import { McpConnectionManager } from './mcp-connection.manager';
import { McpServerConfigRepository } from './mcp-server-config.repository';
import { McpServerSecretsRepository } from './mcp-server-secrets.repository';
import { SecretsCryptoService } from './secrets-crypto.service';

@Injectable()
export class McpAdminService {
  constructor(
    @Inject(McpServerConfigRepository) private readonly configs: McpServerConfigRepository,
    @Inject(McpServerSecretsRepository) private readonly secrets: McpServerSecretsRepository,
    @Inject(McpConnectionManager) private readonly connections: McpConnectionManager,
    @Inject(SecretsCryptoService) private readonly crypto: SecretsCryptoService,
  ) {}

  async listServers(userId: string): Promise<McpServerListResponse> {
    const rows = await this.configs.listForUser(userId);
    return {
      catalogGeneration: this.connections.getCatalogGeneration(userId),
      servers: rows.map((row) => this.toView(userId, row)),
    };
  }

  async createServer(userId: string, body: McpCreateServerRequest): Promise<McpServerView> {
    this.assertSecretsWritable(body.secrets);
    try {
      const created = await this.configs.create(
        {
          serverName: body.serverName,
          enabled: body.enabled,
          url: body.url,
          headersPlain: body.headersPlain,
          startupTimeoutMs: body.startupTimeoutMs,
          toolCallTimeoutMs: body.toolCallTimeoutMs,
          required: body.required,
          failOnStartupError: body.failOnStartupError,
          defaultApproval: body.defaultApproval,
          ...(body.enabledTools !== undefined ? { enabledTools: body.enabledTools } : {}),
          ...(body.disabledTools !== undefined ? { disabledTools: body.disabledTools } : {}),
          maxInstructionBytes: body.maxInstructionBytes,
          reconnectEnabled: body.reconnectEnabled,
          reconnectMaxAttempts: body.reconnectMaxAttempts,
        },
        userId,
      );
      if (body.secrets?.length) {
        await this.secrets.replaceSecrets(
          created.id,
          body.secrets.map((s) => ({ kind: s.kind, name: s.name, value: s.value })),
        );
      }
      await this.connections.reconcile(userId);
      const row = await this.configs.findById(created.id, userId);
      if (!row) throw new Error('McpServerCreateMissing');
      return this.toView(userId, row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: AGENT_ERROR_CODES.mcpServerNameConflict,
          detail: `serverName「${body.serverName}」已存在。`,
        });
      }
      throw error;
    }
  }

  async updateServer(userId: string, id: string, body: McpUpdateServerRequest): Promise<McpServerView> {
    this.assertSecretsWritable(body.secrets);
    const existing = await this.configs.findById(id, userId);
    if (!existing) this.notFound();
    try {
      await this.configs.update(
        id,
        {
          ...(body.serverName !== undefined ? { serverName: body.serverName } : {}),
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.url !== undefined ? { url: body.url } : {}),
          ...(body.headersPlain !== undefined ? { headersPlain: body.headersPlain } : {}),
          ...(body.startupTimeoutMs !== undefined ? { startupTimeoutMs: body.startupTimeoutMs } : {}),
          ...(body.toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs: body.toolCallTimeoutMs } : {}),
          ...(body.required !== undefined ? { required: body.required } : {}),
          ...(body.failOnStartupError !== undefined
            ? { failOnStartupError: body.failOnStartupError }
            : {}),
          ...(body.defaultApproval !== undefined ? { defaultApproval: body.defaultApproval } : {}),
          ...(body.enabledTools !== undefined
            ? { enabledTools: body.enabledTools ?? Prisma.JsonNull }
            : {}),
          ...(body.disabledTools !== undefined
            ? { disabledTools: body.disabledTools ?? Prisma.JsonNull }
            : {}),
          ...(body.maxInstructionBytes !== undefined
            ? { maxInstructionBytes: body.maxInstructionBytes }
            : {}),
          ...(body.reconnectEnabled !== undefined ? { reconnectEnabled: body.reconnectEnabled } : {}),
          ...(body.reconnectMaxAttempts !== undefined
            ? { reconnectMaxAttempts: body.reconnectMaxAttempts }
            : {}),
        },
        userId,
      );
      if (body.secrets?.length) {
        await this.secrets.replaceSecrets(
          id,
          body.secrets.map((s) => ({ kind: s.kind, name: s.name, value: s.value })),
        );
      }
      await this.connections.reconcile(userId);
      const row = await this.configs.findById(id, userId);
      if (!row) throw new Error('McpServerUpdateMissing');
      return this.toView(userId, row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: AGENT_ERROR_CODES.mcpServerNameConflict,
          detail: 'serverName 冲突。',
        });
      }
      throw error;
    }
  }

  async patchServer(userId: string, id: string, body: McpPatchServerRequest): Promise<McpServerView> {
    const existing = await this.configs.findById(id, userId);
    if (!existing) this.notFound();
    await this.configs.update(
      id,
      {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.defaultApproval !== undefined ? { defaultApproval: body.defaultApproval } : {}),
        ...(body.required !== undefined ? { required: body.required } : {}),
        ...(body.enabledTools !== undefined
          ? { enabledTools: body.enabledTools ?? Prisma.JsonNull }
          : {}),
        ...(body.disabledTools !== undefined
          ? { disabledTools: body.disabledTools ?? Prisma.JsonNull }
          : {}),
      },
      userId,
    );
    await this.connections.reconcile(userId);
    const row = await this.configs.findById(id, userId);
    if (!row) throw new Error('McpServerPatchMissing');
    return this.toView(userId, row);
  }

  async deleteServer(userId: string, id: string): Promise<void> {
    const existing = await this.configs.findById(id, userId);
    if (!existing) this.notFound();
    await this.configs.delete(id, userId);
    await this.connections.removeServer(userId, existing.serverName);
    await this.connections.reconcile(userId);
  }

  async testServer(userId: string, id: string): Promise<McpServerTestResponse> {
    const row = await this.configs.findById(id, userId);
    if (!row) this.notFound();
    const result = await this.connections.probeConfig(row);
    return { ok: !result.error, toolNames: result.toolNames, error: result.error };
  }

  private toView(
    userId: string,
    row: NonNullable<Awaited<ReturnType<McpServerConfigRepository['findById']>>>,
  ): McpServerView {
    const runtime = this.connections.getServerRuntime(userId, row.serverName);
    const published = this.connections.getPublishedCatalog(userId);
    const view = published.servers.get(row.serverName);
    return {
      id: row.id,
      serverName: row.serverName,
      enabled: row.enabled,
      transport: 'streamable_http',
      url: row.url,
      headersPlain: (row.headersPlain ?? {}) as Record<string, string>,
      startupTimeoutMs: row.startupTimeoutMs,
      toolCallTimeoutMs: row.toolCallTimeoutMs,
      required: row.required,
      failOnStartupError: row.failOnStartupError,
      defaultApproval: row.defaultApproval,
      enabledTools: parseStringList(row.enabledTools),
      disabledTools: parseStringList(row.disabledTools),
      maxInstructionBytes: row.maxInstructionBytes,
      reconnectEnabled: row.reconnectEnabled,
      reconnectMaxAttempts: row.reconnectMaxAttempts,
      status: runtime?.status ?? view?.status ?? 'disconnected',
      toolCount: view?.toolCountExposed ?? view?.tools.length ?? 0,
      toolCountExposed: view?.toolCountExposed ?? view?.tools.length ?? 0,
      toolCountTotal: view?.toolCountTotal ?? view?.tools.length ?? 0,
      catalogGeneration: this.connections.getCatalogGeneration(userId),
      lastError: runtime?.lastError ?? view?.lastError ?? null,
      secretsConfigured: this.secrets.secretsConfigured(
        row.secrets as Array<{ kind: import('@prisma/client').McpSecretKind; name: string }>,
      ),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertSecretsWritable(secrets: McpCreateServerRequest['secrets']): void {
    if (!secrets?.length) return;
    if (!this.crypto.canEncrypt()) {
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.secretsMasterKeyMissing,
        detail: '未配置 HARNESS_SECRETS_MASTER_KEY，无法保存 MCP 凭证。',
      });
    }
  }

  private notFound(): never {
    throw new NotFoundException({
      code: AGENT_ERROR_CODES.mcpServerNotFound,
      detail: 'MCP Server 配置不存在。',
    });
  }
}

function parseStringList(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  return null;
}
