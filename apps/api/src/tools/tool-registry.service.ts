import { Inject, Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import type {
  AgentTool,
  AgentToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from './agent-tool.types';
import { AGENT_TOOLS } from './tool-catalog';

// 工具注册表只负责发现、校验和分派，不包含任何具体工具业务逻辑。
@Injectable()
export class ToolRegistryService {
  private readonly toolsByName: Map<string, AgentTool>;

  constructor(@Inject(AGENT_TOOLS) tools: AgentTool[]) {
    this.toolsByName = new Map();
    // 启动期建立唯一索引，重复工具名属于配置错误，必须立即失败而不是后注册覆盖前者。
    for (const tool of tools) {
      if (this.toolsByName.has(tool.name)) {
        throw new Error(`重复注册工具：${tool.name}`);
      }
      this.toolsByName.set(tool.name, tool);
    }
  }

  // 返回当前可用工具的 OpenAI Function Calling 声明。
  definitions(excludedNames: ReadonlySet<string> = new Set()): AgentToolDefinition[] | undefined {
    // 未配置供应商的工具不会暴露给模型，避免模型调用一个注定失败的能力。
    const definitions = [...this.toolsByName.values()]
      .filter((tool) => tool.isAvailable() && !excludedNames.has(tool.name))
      .map((tool) => tool.definition());
    return definitions.length ? definitions : undefined;
  }

  // 按工具自身 schema 解析模型返回的 JSON 参数。
  parseInput(name: string, rawArguments: string): unknown {
    const tool = this.get(name);
    let value: unknown;
    try {
      value = JSON.parse(rawArguments);
    } catch {
      throw new Error(AGENT_ERROR_CODES.invalidToolArguments);
    }
    // JSON 语法正确不代表业务参数有效，第二层交给工具自己的 Zod schema 校验。
    const parsed = tool.inputSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error(tool.inputErrorCode ?? AGENT_ERROR_CODES.invalidToolArguments);
    }
    return parsed.data;
  }

  // 返回工具对一次合法输入声明的运行资源单位，默认按一次调用计算。
  units(name: string, input: unknown): { units: number; limit?: number } {
    const tool = this.get(name);
    return {
      units: tool.units ? tool.units(input) : 1,
      ...(tool.maxUnitsPerRun === undefined ? {} : { limit: tool.maxUnitsPerRun }),
    };
  }

  // 执行已注册工具，统一处理未知工具、不可用工具和参数错误。
  async execute(
    name: string,
    input: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<unknown>> {
    const tool = this.get(name);
    if (!tool.isAvailable()) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.toolUnavailable,
          detail: '当前工具未配置或暂不可用。',
          retryable: true,
        },
        modelContent: JSON.stringify({ ok: false, code: AGENT_ERROR_CODES.toolUnavailable }),
        metrics: { durationMs: 0 },
      };
    }
    return tool.execute(input, context);
  }

  // 查找工具并统一转换未知工具错误。
  private get(name: string): AgentTool {
    const tool = this.toolsByName.get(name);
    if (!tool) throw new Error(AGENT_ERROR_CODES.unknownTool);
    return tool;
  }
}
