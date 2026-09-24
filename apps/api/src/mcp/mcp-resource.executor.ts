import { Inject, Injectable, Logger } from '@nestjs/common';
import { AGENT_ERROR_CODES, AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import type { ToolExecutionContext, ToolExecutionResult } from '../tools/agent-tool.types';
import { describeLogError, shortLogId } from '../shared/logging.utils';
import { McpConnectionManager } from './mcp-connection.manager';
import type { RunMcpSnapshot } from './mcp.types';
import { mcpServerNameSchema } from '@harness/agent-protocol';

type ServerInput = { server: string };

@Injectable()
export class McpResourceExecutor {
  private readonly logger = new Logger(McpResourceExecutor.name);

  constructor(@Inject(McpConnectionManager) private readonly connections: McpConnectionManager) {}

  async execute(
    toolName: string,
    input: unknown,
    context: ToolExecutionContext,
    snapshot?: RunMcpSnapshot,
  ): Promise<ToolExecutionResult<unknown>> {
    const parsed = mcpServerNameSchema.safeParse((input as ServerInput)?.server);
    if (!parsed.success) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.invalidToolArguments,
          detail: '参数 server 必须是合法的 MCP serverName。',
          retryable: false,
        },
      };
    }
    const serverName = parsed.data;
    if (!this.isServerInSnapshot(serverName, snapshot)) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.mcpUnavailable,
          detail: `MCP Server「${serverName}」不在当前 Run 快照内或未就绪。`,
          retryable: true,
        },
      };
    }
    const client = this.connections.getClient(serverName);
    if (!client) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.mcpUnavailable,
          detail: `MCP Server「${serverName}」当前无可用连接。`,
          retryable: true,
        },
      };
    }
    const runtime = this.connections.getServerRuntime(serverName);
    const timeoutMs = runtime?.toolCallTimeoutMs ?? 60_000;
    const startedAt = Date.now();
    try {
      if (toolName === AGENT_TOOL_NAMES.listMcpResources) {
        const resources = await this.listAllResources(client, timeoutMs, context.signal);
        return {
          status: 'succeeded',
          output: { server: serverName, resources },
          logFields: { serverName, durationMs: Date.now() - startedAt },
        };
      }
      if (toolName === AGENT_TOOL_NAMES.listMcpResourceTemplates) {
        const templates = await this.listAllResourceTemplates(client, timeoutMs, context.signal);
        return {
          status: 'succeeded',
          output: { server: serverName, resourceTemplates: templates },
          logFields: { serverName, durationMs: Date.now() - startedAt },
        };
      }
      if (toolName === AGENT_TOOL_NAMES.readMcpResource) {
        const uri = (input as { uri?: string }).uri;
        if (!uri || typeof uri !== 'string' || !uri.trim()) {
          return {
            status: 'failed',
            error: {
              code: AGENT_ERROR_CODES.invalidToolArguments,
              detail: 'read_mcp_resource 需要非空 uri。',
              retryable: false,
            },
          };
        }
        const result = await withTimeout(
          client.readResource({ uri: uri.trim() }, { signal: context.signal }),
          timeoutMs,
          'readResource 超时',
        );
        return {
          status: 'succeeded',
          output: { server: serverName, uri: uri.trim(), contents: result.contents ?? [] },
          logFields: { serverName, durationMs: Date.now() - startedAt },
        };
      }
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.unknownTool,
          detail: '未知的 MCP Resource 工具。',
          retryable: false,
        },
      };
    } catch (error) {
      this.logger.warn(
        `MCP resource 调用失败 | server=${serverName} | tool=${toolName} | run=${shortLogId(context.runId ?? 'unknown')} | ${describeLogError(error)}`,
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

  private isServerInSnapshot(serverName: string, snapshot?: RunMcpSnapshot): boolean {
    if (!snapshot) return false;
    return snapshot.latchedServerNames.includes(serverName);
  }

  private async listAllResources(
    client: NonNullable<ReturnType<McpConnectionManager['getClient']>>,
    timeoutMs: number,
    signal?: AbortSignal,
  ) {
    const resources: unknown[] = [];
    let cursor: string | undefined;
    do {
      const page = await withTimeout(
        client.listResources(cursor ? { cursor } : undefined, { signal }),
        timeoutMs,
        'listResources 超时',
      );
      resources.push(...(page.resources ?? []));
      cursor = page.nextCursor;
    } while (cursor);
    return resources;
  }

  private async listAllResourceTemplates(
    client: NonNullable<ReturnType<McpConnectionManager['getClient']>>,
    timeoutMs: number,
    signal?: AbortSignal,
  ) {
    const templates: unknown[] = [];
    let cursor: string | undefined;
    do {
      const page = await withTimeout(
        client.listResourceTemplates(cursor ? { cursor } : undefined, { signal }),
        timeoutMs,
        'listResourceTemplates 超时',
      );
      templates.push(...(page.resourceTemplates ?? []));
      cursor = page.nextCursor;
    } while (cursor);
    return templates;
  }
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
