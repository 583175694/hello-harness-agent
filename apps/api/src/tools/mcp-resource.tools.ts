import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AGENT_TOOL_NAMES, mcpServerNameSchema } from '@harness/agent-protocol';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

const serverParamSchema = z.object({ server: mcpServerNameSchema }).strict();

const readResourceInputSchema = serverParamSchema.extend({
  uri: z.string().trim().min(1).max(4096),
});

function serverOnlyDefinition(
  name: string,
  description: string,
): AgentTool['definition'] {
  return () => ({
    name,
    description,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        server: {
          type: 'string',
          description: '已配置的 MCP serverName（与 Settings 中一致）。',
        },
      },
      required: ['server'],
    },
  });
}

@Injectable()
export class ListMcpResourcesTool implements AgentTool<{ server: string }> {
  readonly name = AGENT_TOOL_NAMES.listMcpResources;
  readonly inputSchema = serverParamSchema;
  readonly executionPolicy = { timeoutMs: 60_000, approval: 'auto_execute' } as const;

  definition() {
    return serverOnlyDefinition(
      this.name,
      '列出当前 Run 已 latch 的 MCP Server 上的 resources（不含 tools）。',
    )();
  }

  isAvailable(): boolean {
    return true;
  }

  execute(): Promise<ToolExecutionResult<unknown>> {
    throw new Error('MCP resource tools must execute via ToolRegistryService');
  }
}

@Injectable()
export class ListMcpResourceTemplatesTool implements AgentTool<{ server: string }> {
  readonly name = AGENT_TOOL_NAMES.listMcpResourceTemplates;
  readonly inputSchema = serverParamSchema;
  readonly executionPolicy = { timeoutMs: 60_000, approval: 'auto_execute' } as const;

  definition() {
    return serverOnlyDefinition(
      this.name,
      '列出 MCP Server 的 resource URI 模板，便于构造 read_mcp_resource 的 uri。',
    )();
  }

  isAvailable(): boolean {
    return true;
  }

  execute(): Promise<ToolExecutionResult<unknown>> {
    throw new Error('MCP resource tools must execute via ToolRegistryService');
  }
}

@Injectable()
export class ReadMcpResourceTool implements AgentTool<{ server: string; uri: string }> {
  readonly name = AGENT_TOOL_NAMES.readMcpResource;
  readonly inputSchema = readResourceInputSchema;
  readonly executionPolicy = { timeoutMs: 120_000, approval: 'require_approval' } as const;

  definition() {
    return {
      name: this.name,
      description: '读取 MCP Server 上指定 URI 的 resource 内容（按需加载，不进入 tool catalog）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          server: {
            type: 'string',
            description: '已配置的 MCP serverName。',
          },
          uri: {
            type: 'string',
            description: 'MCP resource URI（来自 list_mcp_resources 或模板）。',
          },
        },
        required: ['server', 'uri'],
      },
    };
  }

  isAvailable(): boolean {
    return true;
  }

  execute(): Promise<ToolExecutionResult<unknown>> {
    throw new Error('MCP resource tools must execute via ToolRegistryService');
  }
}
