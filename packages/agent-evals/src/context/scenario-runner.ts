import type { EvalApiClient } from '../api-client.js';
import { emptyTrialMetrics, gradeContextTrial } from './graders.js';
import type {
  ContextEvalTask,
  ContextJudgeResult,
  ContextTrialResult,
  ObservedRunEvent,
  ScenarioRun,
} from './types.js';

type ContextApi = Pick<
  EvalApiClient,
  'createSession' | 'createRun' | 'subscribeRun' | 'getRun' | 'getSession' | 'deleteSession'
>;

export type ContextJudge = {
  (input: {
    task: ContextEvalTask;
    answer: string;
    runs: ScenarioRun[];
  }): Promise<ContextJudgeResult>;
  profile?: { model: string; endpoint: string };
};

export async function runContextTrial(input: {
  task: ContextEvalTask;
  trialIndex: number;
  api: ContextApi;
  model: string;
  reasoningEffort: 'off' | 'low' | 'high' | 'max';
  keepSession: boolean;
  judge?: ContextJudge;
  timeoutMs?: number;
  contextWindowTokens: number;
  plannedInputTokens: number;
}): Promise<ContextTrialResult> {
  const startedAt = new Date();
  const runs: ScenarioRun[] = [];
  let sessionId: string | undefined;
  let result: ContextTrialResult;
  try {
    sessionId = await input.api.createSession(
      `[CTX] ${input.task.id}`.slice(0, 28),
      AbortSignal.timeout(10_000),
    );
    for (const step of input.task.scenario) {
      const requestStartedAt = new Date();
      const run = await input.api.createRun(
        sessionId,
        step.content,
        { model: input.model, reasoningEffort: input.reasoningEffort },
        AbortSignal.timeout(10_000),
      );
      const signal = AbortSignal.timeout(input.timeoutMs ?? 180_000);
      let observations: ObservedRunEvent[];
      let reconnectCursor: number | undefined;
      let reconnect: ScenarioRun['reconnect'];
      if (step.disconnectAfterEvent) {
        const first = await input.api.subscribeRun(run, {
          signal,
          stopAfter: (event) => event.type === step.disconnectAfterEvent,
        });
        reconnectCursor = first.at(-1)?.event.seq;
        const second = await input.api.subscribeRun(run, {
          signal,
          lastEventId: reconnectCursor,
        });
        observations = [...first, ...second];
        reconnect = {
          expectedEventType: step.disconnectAfterEvent,
          disconnectObserved: first.some((item) => item.event.type === step.disconnectAfterEvent),
          firstConnectionEventCount: first.length,
          duplicateEventIds: duplicateEventIds(observations),
        };
      } else observations = await input.api.subscribeRun(run, { signal });
      const snapshot = await input.api.getRun(run.runId, AbortSignal.timeout(10_000));
      const firstDelta = observations.find((item) => item.event.type === 'message.delta');
      runs.push({
        runId: run.runId,
        requestStartedAt: requestStartedAt.toISOString(),
        events: observations,
        snapshot,
        disconnected: Boolean(step.disconnectAfterEvent),
        ...(reconnectCursor !== undefined ? { reconnectCursor } : {}),
        ...(reconnect ? { reconnect } : {}),
        ...(firstDelta
          ? { ttftMs: new Date(firstDelta.receivedAt).getTime() - requestStartedAt.getTime() }
          : {}),
      });
      if (snapshot.status !== 'completed')
        throw new Error(
          `Run ${run.runId} ended with ${snapshot.status}: ${snapshot.error?.code ?? ''}`,
        );
    }
    const session = await input.api.getSession(sessionId, AbortSignal.timeout(10_000));
    const answer = runs.at(-1)?.snapshot.assistantContent ?? '';
    const rules = gradeContextTrial(
      input.task,
      answer,
      runs,
      input.contextWindowTokens,
      input.plannedInputTokens,
    );
    const completedAt = new Date();
    result = {
      taskId: input.task.id,
      trialIndex: input.trialIndex,
      capability: input.task.capability,
      pressure: input.task.pressure,
      suite: input.task.suite,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      sessionId,
      modelProfile: runs.at(-1)?.snapshot.profile,
      answer,
      runs,
      session,
      rules,
      passed: rules.every((rule) => rule.passed),
      criticalViolations: rules.filter((rule) => rule.critical && !rule.passed).length,
      metrics: collectMetrics(runs, input.contextWindowTokens, input.plannedInputTokens),
    };
    if (input.judge) {
      try {
        result.judge = await input.judge({ task: input.task, answer, runs });
      } catch (error) {
        result.judgeError = error instanceof Error ? error.message : 'Context Judge failed';
      }
    }
  } catch (error) {
    const completedAt = new Date();
    const answer = runs.at(-1)?.snapshot.assistantContent ?? '';
    const diagnosticRules = runs.length
      ? gradeContextTrial(
          input.task,
          answer,
          runs,
          input.contextWindowTokens,
          input.plannedInputTokens,
        )
      : [];
    result = {
      taskId: input.task.id,
      trialIndex: input.trialIndex,
      capability: input.task.capability,
      pressure: input.task.pressure,
      suite: input.task.suite,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      ...(sessionId ? { sessionId } : {}),
      ...(answer ? { answer } : {}),
      runs,
      rules: [
        ...diagnosticRules,
        {
          id: 'trial-execution',
          category: 'trace',
          passed: false,
          critical: true,
          detail: error instanceof Error ? error.message : 'Unknown trial error',
        },
      ],
      passed: false,
      criticalViolations:
        1 + diagnosticRules.filter((rule) => rule.critical && !rule.passed).length,
      metrics: collectMetrics(runs, input.contextWindowTokens, input.plannedInputTokens),
      error: error instanceof Error ? error.message : 'Unknown trial error',
    };
  }
  if (sessionId && !input.keepSession) {
    try {
      await input.api.deleteSession(sessionId, AbortSignal.timeout(10_000));
    } catch (error) {
      result.cleanupError = error instanceof Error ? error.message : 'Session cleanup failed';
    }
  }
  return result;
}

function duplicateEventIds(events: ObservedRunEvent[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of events) {
    if (seen.has(item.event.eventId)) duplicates.add(item.event.eventId);
    seen.add(item.event.eventId);
  }
  return [...duplicates];
}

function collectMetrics(
  runs: ScenarioRun[],
  contextWindowTokens: number,
  plannedInputTokens: number,
): ContextTrialResult['metrics'] {
  if (!runs.length)
    return {
      ...emptyTrialMetrics(),
      plannedInputTokens,
      plannedPressureRatio: plannedInputTokens / Math.max(contextWindowTokens, 1),
    };
  const rounds = runs.flatMap((run) => run.snapshot.observability?.modelRounds ?? []);
  const uniqueEvents = new Map(
    runs.flatMap((run) => run.events).map((item) => [item.event.eventId, item] as const),
  );
  const toolIds = [...uniqueEvents.values()].flatMap((item) => {
    if (item.event.type !== 'tool.started') return [];
    const payload = item.event.payload;
    return typeof payload === 'object' && payload !== null && 'toolCallId' in payload
      ? [String(payload.toolCallId)]
      : [];
  });
  const sumNullable = (field: 'promptTokens' | 'completionTokens' | 'cachedTokens') =>
    rounds.some((round) => round[field] === null)
      ? null
      : rounds.reduce((total, round) => total + (round[field] ?? 0), 0);
  const ttfts = runs.flatMap((run) => (run.ttftMs === undefined ? [] : [run.ttftMs]));
  return {
    modelRounds: rounds.length,
    toolCalls: new Set(toolIds).size,
    duplicateToolCalls: toolIds.length - new Set(toolIds).size,
    promptTokens: sumNullable('promptTokens'),
    completionTokens: sumNullable('completionTokens'),
    cachedTokens: sumNullable('cachedTokens'),
    estimatedPromptTokens: rounds.reduce((total, round) => total + round.estimatedPromptTokens, 0),
    peakPromptTokens: rounds.some((round) => round.promptTokens !== null)
      ? Math.max(
          ...rounds.flatMap((round) => (round.promptTokens === null ? [] : [round.promptTokens])),
        )
      : null,
    peakEstimatedPromptTokens: Math.max(0, ...rounds.map((round) => round.estimatedPromptTokens)),
    pressureRatio:
      Math.max(0, ...rounds.map((round) => round.estimatedPromptTokens)) /
      Math.max(contextWindowTokens, 1),
    plannedInputTokens,
    plannedPressureRatio: plannedInputTokens / Math.max(contextWindowTokens, 1),
    modelRoundDurationMs: rounds.reduce((total, round) => total + round.durationMs, 0),
    ttftMs: ttfts.length ? ttfts.reduce((total, value) => total + value, 0) / ttfts.length : null,
  };
}
