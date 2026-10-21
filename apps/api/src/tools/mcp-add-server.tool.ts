import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import {
  AGENT_ERROR_CODES,
  AGENT_TOOL_NAMES,
  mcpAddServerAgentInputSchema,
  type McpAddServerAgentInput,
  type McpAddServerResult,
} from '@harness/agent-protocol';
import { McpAddServerService } from '../mcp/mcp-add-server.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

@Injectable()
export class McpAddServerTool implements AgentTool<McpAddServerAgentInput, McpAddServerResult> {
  readonly name = AGENT_TOOL_NAMES.mcpAddServer;
  readonly inputSchema = mcpAddServerAgentInputSchema as ZodType<McpAddServerAgentInput>;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = { timeoutMs: 120_000, approval: 'auto_execute' } as const;

  constructor(private readonly addServer: McpAddServerService) {}

  definition() {
    return {
      name: this.name,
      description:
        '为当前用户添加或幂等确认一个 HTTP MCP Server（Streamable HTTP，仅 https）。' +
        ' 当用户粘贴 JSON、CLI 说明、npx 安装命令或混合文本时，由你先从文本中识别 serverName、HTTPS MCP url、Authorization/API Key（若有），再调用本工具；' +
        ' 不要执行 npx/shell。npx 命令若同时含 --url 与 --api-key，应提取为 HTTP 配置（例如 url=https://agent.tinyfish.ai/mcp，Bearer api-key），勿因 stdio 拒绝添加。' +
        ' 纯 stdio/无 https url 时向用户说明仅支持 HTTP MCP，勿调用本工具。' +
        ' 默认 enabled=true、defaultApproval=auto_execute。同名同配置返回 already_exists；同名异配置 rejected。凭证加密落库；回复用户勿回显密钥。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          serverName: { type: 'string' },
          url: { type: 'string' },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          enabled: { type: 'boolean', default: true },
          defaultApproval: {
            type: 'string',
            enum: ['auto_execute', 'require_approval'],
            default: 'auto_execute',
          },
        },
        required: ['serverName', 'url'],
      },
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(
    input: McpAddServerAgentInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<McpAddServerResult>> {
    const output = await this.addServer.addFromAgent(context.userId, input);
    if (output.status === 'rejected') {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.invalidToolArguments,
          detail: output.message ?? '无法添加 MCP Server。',
          retryable: true,
        },
        logFields: { serverName: output.serverName, mcpAddStatus: output.status },
      };
    }
    return {
      status: 'succeeded',
      output,
      logFields: {
        serverName: output.serverName,
        mcpAddStatus: output.status,
        connectionOk: output.connectionOk ?? false,
      },
    };
  }
}
