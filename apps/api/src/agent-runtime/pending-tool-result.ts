import type { AgentRuntimeEvent } from './agent-runtime.types';
import type { RuntimeLifecycleToolCall, RuntimeToolResultSummary } from './runtime-lifecycle';
import type { ToolResultCandidate } from '../context-engineering/context-engineering.types';

export type PendingToolResult = {
  candidate: ToolResultCandidate;
  startedEvent?: AgentRuntimeEvent;
  event?: AgentRuntimeEvent;
  controlOutcome?: 'approved_by_user' | 'rejected_by_user' | 'rejected_by_policy';
  enterFinalAnswer: boolean;
  summary: RuntimeToolResultSummary;
};

export function sortPendingToolResultsByCallOrder(
  pending: PendingToolResult[],
  calls: ReadonlyArray<RuntimeLifecycleToolCall>,
): void {
  const toolCallOrder = new Map(calls.map((call, index) => [call.id, index] as const));
  pending.sort(
    (left, right) =>
      (toolCallOrder.get(left.candidate.toolCallId) ?? 0) -
      (toolCallOrder.get(right.candidate.toolCallId) ?? 0),
  );
}

export function yieldPendingToolEvents(
  pending: PendingToolResult,
): Generator<AgentRuntimeEvent, void, unknown> {
  return (function* () {
    if (pending.startedEvent) yield pending.startedEvent;
    if (pending.event) yield pending.event;
  })();
}
