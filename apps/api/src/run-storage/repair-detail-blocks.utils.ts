import type { AssistantContentBlock, ToolExecutionSnapshot } from '@harness/agent-protocol';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

export function synthesizeToolActivityBlocksFromExecutions(
  executions: ToolExecutionSnapshot[],
): AssistantContentBlock[] {
  return executions.map((execution) => ({
    id: `synthetic-${execution.toolCallId}`,
    type: 'tool_activity' as const,
    toolCallId: execution.toolCallId,
    toolName: displayToolName(execution),
    status: execution.status,
    title: executionTitle(execution),
    startedAt: execution.startedAt,
    ...(execution.completedAt ? { completedAt: execution.completedAt } : {}),
    ...(execution.durationMs !== undefined ? { durationMs: execution.durationMs } : {}),
  }));
}

function displayToolName(execution: ToolExecutionSnapshot): string {
  if (execution.toolName === AGENT_TOOL_NAMES.externalTool) return execution.publicName;
  return execution.toolName;
}

function executionTitle(execution: ToolExecutionSnapshot): string {
  if (execution.toolName === 'web_search') return `搜索：${execution.input.query}`;
  if (execution.toolName === AGENT_TOOL_NAMES.externalTool) return execution.publicName;
  if (execution.toolName === 'bash' && execution.input.description)
    return execution.input.description;
  return execution.toolName;
}
