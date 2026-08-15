import type { RunStreamEvent } from '@harness/agent-protocol';
import type {
  ContextEvalTask,
  ContextRuleResult,
  ContextTrialResult,
  ScenarioRun,
  TextAssertion,
} from './types.js';

function evaluateText(
  category: ContextRuleResult['category'],
  answer: string,
  assertion: TextAssertion,
): ContextRuleResult {
  const passed =
    assertion.kind === 'contains'
      ? answer.includes(assertion.value)
      : assertion.kind === 'excludes'
        ? !answer.includes(assertion.value)
        : assertion.kind === 'not_ends_with'
          ? !answer
              .trimEnd()
              .replace(/[。.!！]+$/gu, '')
              .endsWith(assertion.value)
          : new RegExp(assertion.value, 'u').test(answer);
  return {
    id: assertion.id,
    category,
    passed,
    critical: assertion.critical ?? false,
    detail: passed
      ? `${assertion.kind} 断言通过。`
      : `${assertion.kind} 断言失败：${assertion.value}`,
  };
}

export function gradeContextTrial(
  task: ContextEvalTask,
  answer: string,
  runs: ScenarioRun[],
  contextWindowTokens: number,
  plannedInputTokens: number,
): ContextRuleResult[] {
  const rules = [
    ...task.expectations.outcome.map((item) => evaluateText('outcome', answer, item)),
    ...(task.expectations.constraints ?? []).map((item) =>
      evaluateText('constraint', answer, item),
    ),
    ...(task.expectations.evidence ?? []).map((item) => evaluateText('evidence', answer, item)),
  ];
  const events = runs.flatMap((run) => run.events.map((item) => item.event));
  const toolStarted = events.filter((event) => event.type === 'tool.started');
  const toolTerminal = events.filter((event) =>
    ['tool.completed', 'tool.failed', 'tool.cancelled'].includes(event.type),
  );
  const toolCallId = (event: RunStreamEvent): string | undefined => {
    const payload = event.payload;
    return typeof payload === 'object' && payload !== null && 'toolCallId' in payload
      ? String(payload.toolCallId)
      : undefined;
  };
  const startedIds = new Set(toolStarted.map(toolCallId).filter(Boolean));
  const terminalIds = new Set(toolTerminal.map(toolCallId).filter(Boolean));
  rules.push({
    id: 'trace-tool-protocol-closed',
    category: 'trace',
    passed: [...startedIds].every((id) => terminalIds.has(id)),
    critical: true,
    detail: `started=${startedIds.size}, terminal=${terminalIds.size}`,
  });
  rules.push({
    id: 'trace-run-terminal',
    category: 'trace',
    passed: runs.every((run) => ['completed', 'failed', 'cancelled'].includes(run.snapshot.status)),
    critical: true,
    detail: runs.map((run) => `${run.runId}:${run.snapshot.status}`).join(', '),
  });
  rules.push({
    id: 'trace-snapshot-answer-consistent',
    category: 'trace',
    passed: runs.at(-1)?.snapshot.assistantContent === answer,
    critical: true,
    detail: '最终 Snapshot 与评分文本必须一致。',
  });
  if (task.expectations.requireTool)
    rules.push({
      id: 'trace-tool-required',
      category: 'trace',
      passed: startedIds.size > 0,
      critical: false,
      detail: `工具调用=${startedIds.size}`,
    });
  if (task.expectations.maxToolCalls !== undefined)
    rules.push({
      id: 'trace-tool-budget',
      category: 'trace',
      passed: startedIds.size <= task.expectations.maxToolCalls,
      critical: false,
      detail: `${startedIds.size}/${task.expectations.maxToolCalls}`,
    });
  if (task.expectations.minToolCalls !== undefined)
    rules.push({
      id: 'trace-tool-minimum',
      category: 'trace',
      passed: startedIds.size >= task.expectations.minToolCalls,
      critical: false,
      detail: `${startedIds.size}/${task.expectations.minToolCalls}`,
    });
  for (const run of runs.filter((item) => item.disconnected)) {
    rules.push({
      id: `trace-reconnect-no-duplicate-${run.runId}`,
      category: 'trace',
      passed: (run.reconnect?.duplicateEventIds.length ?? 1) === 0,
      critical: true,
      detail: `duplicates=${run.reconnect?.duplicateEventIds.join(',') || 'none'}, cursor=${run.reconnectCursor ?? 'none'}`,
    });
    rules.push({
      id: `trace-disconnect-point-observed-${run.runId}`,
      category: 'trace',
      passed: run.reconnect?.disconnectObserved === true,
      critical: true,
      detail: `expected=${run.reconnect?.expectedEventType ?? 'unknown'}, observed=${run.reconnect?.disconnectObserved ?? false}`,
    });
  }
  if (task.capability !== 'connection_durability' && task.capability !== 'short_regression') {
    const ratio = plannedInputTokens / Math.max(contextWindowTokens, 1);
    const [minimum, maximum] =
      task.pressure === 'S'
        ? [0.04, 0.15]
        : task.pressure === 'M'
          ? [0.35, 0.6]
          : task.pressure === 'L'
            ? [0.7, 0.95]
            : [0.95, Number.POSITIVE_INFINITY];
    rules.push({
      id: 'trace-context-pressure',
      category: 'trace',
      passed: ratio >= minimum && ratio <= maximum,
      critical: true,
      detail: `pressure=${task.pressure}, planned=${plannedInputTokens}, window=${contextWindowTokens}, ratio=${ratio.toFixed(3)}, expected=${minimum}-${Number.isFinite(maximum) ? maximum : '∞'}`,
    });
  }
  return rules;
}

export function emptyTrialMetrics(): ContextTrialResult['metrics'] {
  return {
    modelRounds: 0,
    toolCalls: 0,
    duplicateToolCalls: 0,
    promptTokens: null,
    completionTokens: null,
    cachedTokens: null,
    estimatedPromptTokens: 0,
    peakPromptTokens: null,
    peakEstimatedPromptTokens: 0,
    pressureRatio: 0,
    plannedInputTokens: 0,
    plannedPressureRatio: 0,
    modelRoundDurationMs: 0,
    ttftMs: null,
  };
}
