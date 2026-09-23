import { Inject, Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES, AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import { McpToolCatalogService } from '../mcp/mcp-tool-catalog.service';
import { McpToolExecutor } from '../mcp/mcp-tool-executor';
import { isMcpPublicToolName } from '../mcp/mcp.types';
import type {
  AgentTool,
  AgentToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from './agent-tool.types';
import { AGENT_TOOLS } from './tool-catalog';
import type { ToolRegistryContext } from './tool-registry.types';

export class ToolInputValidationError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string,
  ) {
    super(code);
  }
}

// 工具注册表只负责发现、校验和分派，不包含任何具体工具业务逻辑。
@Injectable()
export class ToolRegistryService {
  private readonly toolsByName: Map<string, AgentTool>;

  constructor(
    @Inject(AGENT_TOOLS) tools: AgentTool[],
    @Inject(McpToolCatalogService) private readonly mcpCatalog: McpToolCatalogService,
    @Inject(McpToolExecutor) private readonly mcpExecutor: McpToolExecutor,
  ) {
    this.toolsByName = new Map();
    // 启动期建立唯一索引，重复工具名属于配置错误，必须立即失败而不是后注册覆盖前者。
    for (const tool of tools) {
      if (this.toolsByName.has(tool.name)) {
        throw new Error(`重复注册工具：${tool.name}`);
      }
      this.toolsByName.set(tool.name, tool);
    }
  }

  resolveName(name: string): string {
    if (isMcpPublicToolName(name)) return name;
    if (name === AGENT_TOOL_NAMES.executeCommand) return AGENT_TOOL_NAMES.bash;
    return name;
  }

  // 返回当前可用工具的 OpenAI Function Calling 声明。
  definitions(ctx?: ToolRegistryContext): AgentToolDefinition[] | undefined {
    const staticDefs = [...this.toolsByName.values()]
      .filter((tool) => tool.isAvailable())
      .map((tool) => tool.definition());
    const mcpDefs = this.mcpCatalog.definitionsForRun(ctx?.mcpSnapshot);
    const definitions = [...staticDefs, ...mcpDefs];
    return definitions.length ? definitions : undefined;
  }

  // 返回工具声明的不可由模型覆盖的外层执行策略。
  executionPolicy(name: string, ctx?: ToolRegistryContext): AgentTool['executionPolicy'] {
    if (isMcpPublicToolName(name)) {
      const entry = this.mcpCatalog.lookupEntry(name, ctx?.mcpSnapshot);
      return {
        timeoutMs: entry?.toolCallTimeoutMs ?? 60_000,
        approval: entry?.defaultApproval ?? 'require_approval',
      };
    }
    return this.get(name).executionPolicy;
  }

  approvalPolicy(
    name: string,
    ctx?: ToolRegistryContext,
  ): 'auto_execute' | 'require_approval' | 'direct_reject' {
    return this.executionPolicy(name, ctx).approval ?? 'auto_execute';
  }

  // 按工具自身 schema 解析模型返回的 JSON 参数。
  parseInput(name: string, rawArguments: string, ctx?: ToolRegistryContext): unknown {
    if (isMcpPublicToolName(name)) {
      if (!this.mcpCatalog.lookupEntry(name, ctx?.mcpSnapshot)) {
        throw new ToolInputValidationError(
          AGENT_ERROR_CODES.unknownTool,
          '未知的 MCP 工具。',
        );
      }
      try {
        return JSON.parse(rawArguments);
      } catch {
        throw new ToolInputValidationError(
          AGENT_ERROR_CODES.invalidToolArguments,
          '工具参数不是有效的 JSON。',
        );
      }
    }
    const tool = this.get(name);
    let value: unknown;
    try {
      value = JSON.parse(rawArguments);
    } catch {
      throw new ToolInputValidationError(
        AGENT_ERROR_CODES.invalidToolArguments,
        '工具参数不是有效的 JSON。',
      );
    }
    const parsed = tool.inputSchema.safeParse(value);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('；');
      throw new ToolInputValidationError(
        tool.inputErrorCode ?? AGENT_ERROR_CODES.invalidToolArguments,
        `工具参数校验失败：${detail}`,
      );
    }
    return parsed.data;
  }

  // 执行已注册工具，统一处理未知工具、不可用工具和参数错误。
  async execute(
    name: string,
    input: unknown,
    context: ToolExecutionContext,
    ctx?: ToolRegistryContext,
  ): Promise<ToolExecutionResult<unknown>> {
    if (isMcpPublicToolName(name)) {
      return this.mcpExecutor.execute(name, input, context, ctx?.mcpSnapshot);
    }
    const tool = this.get(name);
    if (!tool.isAvailable()) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.toolUnavailable,
          detail: '当前工具未配置或暂不可用。',
          retryable: true,
        },
      };
    }
    return tool.execute(input, context);
  }

  // 查找工具并统一转换未知工具错误。
  private get(name: string): AgentTool {
    const resolved = this.resolveName(name);
    if (isMcpPublicToolName(resolved)) {
      throw new Error(AGENT_ERROR_CODES.unknownTool);
    }
    const tool = this.toolsByName.get(resolved);
    if (!tool) throw new Error(AGENT_ERROR_CODES.unknownTool);
    return tool;
  }
}
