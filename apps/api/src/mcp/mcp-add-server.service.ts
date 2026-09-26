import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  mcpCreateServerRequestSchema,
  type McpAddServerAgentInput,
  type McpAddServerResult,
} from '@harness/agent-protocol';
import { McpAdminService } from './mcp-admin.service';
import { McpConnectionManager } from './mcp-connection.manager';
import { partitionMcpHeaders } from './mcp-config-secrets';
import { McpServerConfigRepository } from './mcp-server-config.repository';
import {
  assertAgentMcpHttpsUrl,
  normalizeMcpUrlForCompare,
  redactMcpUrlForDisplay,
} from './mcp-url-security';

@Injectable()
export class McpAddServerService {
  constructor(
    @Inject(McpAdminService) private readonly admin: McpAdminService,
    @Inject(McpServerConfigRepository) private readonly configs: McpServerConfigRepository,
    @Inject(McpConnectionManager) private readonly connections: McpConnectionManager,
  ) {}

  async addFromAgent(userId: string, input: McpAddServerAgentInput): Promise<McpAddServerResult> {
    const base = {
      serverName: input.serverName,
      enabled: input.enabled,
      defaultApproval: input.defaultApproval,
    };

    try {
      assertAgentMcpHttpsUrl(input.url);
    } catch (err) {
      return {
        ...base,
        status: 'rejected',
        message: err instanceof Error ? err.message : 'URL 校验失败。',
      };
    }

    const normalizedUrl = normalizeMcpUrlForCompare(input.url);
    const { headersPlain, secrets } = partitionMcpHeaders(input.headers ?? {});
    const existing = await this.configs.findByServerName(input.serverName, userId);

    if (existing) {
      const sameUrl = normalizeMcpUrlForCompare(existing.url) === normalizedUrl;
      const existingPlain = (existing.headersPlain ?? {}) as Record<string, string>;
      const samePlain =
        JSON.stringify(existingPlain) === JSON.stringify(headersPlain);
      const hadSecrets = existing.secrets.length > 0;
      const wantsSecrets = secrets.length > 0;
      if (
        sameUrl &&
        samePlain &&
        existing.enabled === input.enabled &&
        existing.defaultApproval === input.defaultApproval &&
        (!wantsSecrets || hadSecrets)
      ) {
        const probe = await this.connections.probeConfig(existing);
        return {
          status: 'already_exists',
          ...base,
          connectionOk: !probe.error,
          toolNames: probe.toolNames,
          urlRedacted: redactMcpUrlForDisplay(existing.url),
          message: '同名 Server 配置已存在，未重复创建。',
          ...(probe.error ? { warning: probe.error } : {}),
        };
      }
      return {
        ...base,
        status: 'rejected',
        message:
          `serverName「${input.serverName}」已存在且配置不同。请在 Settings 中编辑现有 Server，勿通过 Agent 覆盖。`,
      };
    }

    try {
      const createBody = mcpCreateServerRequestSchema.parse({
        serverName: input.serverName,
        enabled: input.enabled,
        url: input.url.trim(),
        headersPlain,
        required: false,
        failOnStartupError: false,
        defaultApproval: input.defaultApproval,
        secrets: secrets.length ? secrets : undefined,
      });
      const view = await this.admin.createServer(userId, createBody);
      const row = await this.configs.findById(view.id, userId);
      const probe = row ? await this.connections.probeConfig(row) : { toolNames: [], error: '配置缺失' };
      const connectionOk = !probe.error;
      return {
        status: connectionOk ? 'created' : 'created_with_warning',
        ...base,
        connectionOk,
        toolNames: probe.toolNames,
        urlRedacted: redactMcpUrlForDisplay(view.url),
        message: connectionOk ? 'MCP Server 已创建并 reconcile。' : 'MCP Server 已保存，但连接测试失败。',
        ...(probe.error ? { warning: probe.error } : {}),
      };
    } catch (err) {
      const nestBody =
        err instanceof HttpException
          ? (err.getResponse() as { code?: string; detail?: string; message?: string | string[] })
          : undefined;
      const detail =
        (typeof nestBody?.detail === 'string' && nestBody.detail) ||
        (typeof nestBody?.message === 'string' && nestBody.message) ||
        (err instanceof Error ? err.message : '创建失败。');
      const code = nestBody?.code;
      if (code === AGENT_ERROR_CODES.secretsMasterKeyMissing) {
        return {
          ...base,
          status: 'rejected',
          message: '未配置 HARNESS_SECRETS_MASTER_KEY，无法保存 MCP 凭证。请在 Settings 中配置 Server 或设置主密钥。',
        };
      }
      if (code === AGENT_ERROR_CODES.mcpServerNameConflict) {
        return {
          ...base,
          status: 'rejected',
          message: `serverName「${input.serverName}」已存在。`,
        };
      }
      return {
        ...base,
        status: 'rejected',
        message: detail,
      };
    }
  }
}
