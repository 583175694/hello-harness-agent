import type {
  ModelRunProfile,
  RunSnapshot,
  RunStreamEvent,
  SessionDetail,
} from '@harness/agent-protocol';

export type ContextCapability =
  | 'constraint_retention'
  | 'context_pollution'
  | 'evidence_fidelity'
  | 'long_agent_loop'
  | 'connection_durability'
  | 'short_regression';

export type ContextPressure = 'S' | 'M' | 'L' | 'X';

export type ContextScenarioStep = {
  type: 'user_message';
  content: string;
  disconnectAfterEvent?: 'run.started' | 'tool.completed' | 'message.delta';
};

export type TextAssertion = {
  id: string;
  kind: 'contains' | 'excludes' | 'matches' | 'not_ends_with';
  value: string;
  critical?: boolean;
};

export type ContextEvalTask = {
  id: string;
  version: 'context-core-v1';
  suite: 'capability' | 'regression';
  capability: ContextCapability;
  pressure: ContextPressure;
  smoke: boolean;
  scenario: ContextScenarioStep[];
  expectations: {
    outcome: TextAssertion[];
    constraints?: TextAssertion[];
    evidence?: TextAssertion[];
    maxToolCalls?: number;
    minToolCalls?: number;
    requireTool?: boolean;
  };
};

export type ObservedRunEvent = { event: RunStreamEvent; receivedAt: string };

export type ScenarioRun = {
  runId: string;
  requestStartedAt: string;
  events: ObservedRunEvent[];
  snapshot: RunSnapshot;
  disconnected: boolean;
  reconnectCursor?: number;
  reconnect?: {
    expectedEventType: 'run.started' | 'tool.completed' | 'message.delta';
    disconnectObserved: boolean;
    firstConnectionEventCount: number;
    duplicateEventIds: string[];
  };
  ttftMs?: number;
};

export type ContextRuleResult = {
  id: string;
  category: 'outcome' | 'constraint' | 'evidence' | 'trace';
  passed: boolean;
  critical: boolean;
  detail: string;
};

export type ContextJudgeResult = {
  taskCompletion: number;
  constraintFollowing: number;
  evidenceGroundedness: number;
  qualificationPreservation: number;
  goalCoherence: number;
  verdict: 'pass' | 'fail' | 'unknown';
  reason: string;
  usage?: { promptTokens: number; completionTokens: number };
};

export type ContextTrialResult = {
  taskId: string;
  trialIndex: number;
  capability: ContextCapability;
  pressure: ContextPressure;
  suite: 'capability' | 'regression';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  sessionId?: string;
  modelProfile?: ModelRunProfile;
  answer?: string;
  runs: ScenarioRun[];
  session?: SessionDetail;
  rules: ContextRuleResult[];
  passed: boolean;
  criticalViolations: number;
  metrics: {
    modelRounds: number;
    toolCalls: number;
    duplicateToolCalls: number;
    promptTokens: number | null;
    completionTokens: number | null;
    cachedTokens: number | null;
    estimatedPromptTokens: number;
    peakPromptTokens: number | null;
    peakEstimatedPromptTokens: number;
    pressureRatio: number;
    plannedInputTokens: number;
    plannedPressureRatio: number;
    modelRoundDurationMs: number;
    ttftMs: number | null;
  };
  judge?: ContextJudgeResult;
  judgeError?: string;
  error?: string;
  cleanupError?: string;
};

export type ContextExperimentReport = {
  experimentId: string;
  benchmarkVersion: 'context-core-v1';
  benchmarkHash: string;
  graderVersion: 'context-graders-v1';
  fixtureHash: string;
  model: string;
  reasoningEffort: 'off' | 'low' | 'high' | 'max';
  systemPromptHash: string;
  toolSchemaHash: string;
  judgeProfile: {
    enabled: boolean;
    promptVersion: 'context-judge-v1';
    model?: string;
    endpoint?: string;
  };
  startedAt: string;
  completedAt: string;
  seed: number;
  trialsPerTask: number;
  modelContextProfile: {
    contextWindowTokens: number;
    maxOutputTokens: number;
    tokenizer: 'deepseek-v3';
    source: string;
    verified: boolean;
  };
  trials: ContextTrialResult[];
  summary: {
    tasks: number;
    trials: number;
    passed: number;
    passRate: number;
    passAtK: number;
    passPowerK: number;
    criticalViolations: number;
    bootstrap95: { low: number; high: number };
    groups: Array<{
      dimension: 'capability' | 'pressure' | 'suite';
      key: string;
      trials: number;
      passed: number;
      passRate: number;
    }>;
    metrics: {
      promptTokens: number | null;
      completionTokens: number | null;
      cachedTokens: number | null;
      estimatedPromptTokens: number;
      peakPromptTokens: number | null;
      peakEstimatedPromptTokens: number;
      maxPressureRatio: number;
      maxPlannedPressureRatio: number;
      modelRounds: number;
      toolCalls: number;
      duplicateToolCalls: number;
      averageTtftMs: number | null;
      durationMs: number;
      judgePromptTokens: number;
      judgeCompletionTokens: number;
      judgeErrors: number;
    };
  };
};
