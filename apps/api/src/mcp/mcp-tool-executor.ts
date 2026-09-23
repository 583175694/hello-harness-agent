import { Inject, Injectable, Logger } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import type { ToolExecutionContext, ToolExecutionResult } from '../tools/agent-tool.types';
import { describeLogError, shortLogId } from '../shared/logging.utils';
import { McpConnectionManager } from './mcp-connection.manager';
import { McpToolCatalogService } from './mcp-tool-catalog.service';
import { mapMcpCallToolResult } from './mcp-result.mapper';
import type { RunMcpSnapshot } from './mcp.types';

@Injectable()
export class McpToolExecutor {
  private readonly logger = new Logger(McpToolExecutor.name);

  constructor(
    @Inject(McpConnectionManager) private readonly connections: McpConnectionManager,
    @Inject(McpToolCatalogService) private readonly catalog: McpToolCatalogService,
  ) {}

  async execute(
    publicName: string,
    input: unknown,
    context: ToolExecutionContext,
    snapshot?: RunMcpSnapshot,
  ): Promise<ToolExecutionResult<unknown>> {
    const entry = this.catalog.lookupEntry(publicName, snapshot);
    if (!entry) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.unknownTool,
          detail: '未找到 MCP 工具条目。',
          retryable: false,
        },
      };
    }
    if (snapshot && entry.boundGeneration !== snapshot.catalogGeneration) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.mcpCatalogStale,
          detail: 'MCP 工具目录已更新，请新开 Run 后再试。',
          retryable: true,
        },
      };
    }
    const liveGeneration = this.connections.getCatalogGeneration();
    if (snapshot && snapshot.catalogGeneration !== liveGeneration) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.mcpCatalogStale,
          detail: 'MCP 工具目录已更新，请新开 Run 后再试。',
          retryable: true,
        },
      };
    }
    const client = this.connections.getClient(entry.serverName);
    const runtime = this.connections.getServerRuntime(entry.serverName);
    if (!client || runtime?.status !== 'connected') {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.mcpUnavailable,
          detail: 'MCP Server 当前不可用。',
          retryable: true,
        },
      };
    }
    const args =
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    try {
      this.logger.log(
        `MCP 工具调用 | Server=${entry.serverName} | 工具=${entry.rawName} | 公开名=${publicName} | Run=${context.runId ? shortLogId(context.runId) : 'n/a'}`,
      );
      const result = await client.callTool(
        { name: entry.rawName, arguments: args },
        undefined,
        {
          signal: context.signal,
          timeout: entry.toolCallTimeoutMs,
        },
      );
      const mapped = mapMcpCallToolResult(result);
      if (mapped.status === 'failed') {
        this.logger.warn(
          `MCP 工具返回错误 | Server=${entry.serverName} | 工具=${entry.rawName} | 详情=${mapped.error.detail.slice(0, 500)}`,
        );
      }
      return mapped;
    } catch (error) {
      if (context.signal?.aborted) {
        this.logger.warn(
          `MCP 工具调用已取消 | Server=${entry.serverName} | 工具=${entry.rawName}`,
        );
        return {
          status: 'cancelled',
          error: {
            code: AGENT_ERROR_CODES.toolCancelled,
            detail: 'MCP 工具调用已取消。',
            retryable: true,
          },
        };
      }
      this.logger.warn(
        `MCP 工具调用异常 | Server=${entry.serverName} | 工具=${entry.rawName} | 上游=${describeLogError(error)}`,
      );
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.mcpUnavailable,
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
      };
    }
  }
}
