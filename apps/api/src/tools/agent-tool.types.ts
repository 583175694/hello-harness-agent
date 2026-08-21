import type { ZodType } from 'zod';

// 工具执行上下文，负责把会话关联信息和取消信号传给具体工具。
export type ToolExecutionContext = {
  sessionId: string;
  messageId: string;
  toolCallId: string;
  signal?: AbortSignal;
};

export type ToolExecutionLogFields = Readonly<Record<string, string | number | boolean>>;

// 模型可见的通用工具声明，不依赖任何供应商 SDK。
export type AgentToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

// 工具的通用成功或失败结果，不把搜索等具体业务结构泄露给 Registry。
export type ToolExecutionResult<TOutput> =
  | {
      status: 'succeeded';
      output: TOutput;
      logFields?: ToolExecutionLogFields;
    }
  | {
      status: 'failed' | 'timeout' | 'cancelled';
      error: {
        code: string;
        detail: string;
        retryable: boolean;
        // 仅供服务端诊断日志使用，不写入模型上下文或客户端事件。
        cause?: unknown;
      };
      logFields?: ToolExecutionLogFields;
    };

// 具体工具实现的最小契约；Registry 只依赖这组能力。
export interface AgentTool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly inputSchema: ZodType<TInput>;
  readonly inputErrorCode?: string;
  readonly executionPolicy: {
    timeoutMs: number;
    approval?: 'auto_execute' | 'require_approval' | 'direct_reject';
  };
  // 返回当前工具对模型公开的 Function Calling 声明。
  definition(): AgentToolDefinition;
  isAvailable(): boolean;
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult<TOutput>>;
}
