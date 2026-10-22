import { toolInputSummary, toolTitle, type ToolCopyInput } from '@harness/agent-conversation';

export function formatApprovalItem(toolName: string, input: unknown): { title: string; detail: string } {
  const copyInput = (typeof input === 'object' && input !== null ? input : {}) as ToolCopyInput;
  return {
    title: toolTitle(toolName, copyInput),
    detail: toolInputSummary(toolName, copyInput),
  };
}
