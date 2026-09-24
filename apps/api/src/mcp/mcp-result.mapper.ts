import type { ToolExecutionResult } from '../tools/agent-tool.types';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

export function mapMcpCallToolResult(result: unknown): ToolExecutionResult<string> {
  const value = result as {
    isError?: boolean;
    content?: Array<{ type: string; text?: string }>;
  };
  if (value.isError) {
    const detail =
      value.content
        ?.filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('\n') || 'MCP 工具返回错误。';
    return {
      status: 'failed',
      error: { code: AGENT_ERROR_CODES.mcpUnavailable, detail, retryable: true },
    };
  }
  const text =
    value.content
      ?.filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text!)
      .join('\n') ?? '';
  return { status: 'succeeded', output: text || '(empty)' };
}
