import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

/** 同批 tool call 内固定先执行 tool_search，其余保持原相对顺序。 */
export function orderToolCallsForBatch<T extends { name: string }>(calls: ReadonlyArray<T>): T[] {
  const searchCalls: T[] = [];
  const rest: T[] = [];
  for (const call of calls) {
    if (call.name === AGENT_TOOL_NAMES.toolSearch) searchCalls.push(call);
    else rest.push(call);
  }
  return [...searchCalls, ...rest];
}
