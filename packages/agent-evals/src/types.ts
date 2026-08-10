import type {
  AssistantAgentMetadata,
  ChatStreamEvent,
  SessionDetail,
  ToolExecutionSnapshot,
} from '@harness/agent-protocol';

export type EvalCategory =
  | 'direct_answer'
  | 'direct_url'
  | 'product_comparison'
  | 'current_research'
  | 'technical_troubleshooting'
  | 'policy_research'
  | 'travel_research'
  | 'limited_evidence';

export type ToolExpectation = 'forbidden' | 'required' | 'optional';

export type ResearchEvalCase = {
  id: string;
  version: string;
  category: EvalCategory;
  prompt: string;
  suites: Array<'smoke' | 'full'>;
  expectations: {
    toolUse: ToolExpectation;
    search: ToolExpectation;
    fetch: ToolExpectation;
    minFetchedSources?: number;
    maxToolCalls: number;
    maxDurationMs: number;
    requiredTopics?: string[];
    preferredSourceTypes?: string[];
    expectedLimitations?: string[];
    forbiddenBehaviors: string[];
  };
};

export type HardRule = {
  id: string;
  passed: boolean;
  detail: string;
};

export type EvalCaseMetrics = {
  searchCalls: number;
  fetchCalls: number;
  networkAttempts: number;
  uniqueDocuments: number;
  passageCharacters: number;
  stopReason?: string;
  clueSources: number;
  fetchedSources: number;
  usedSources: number;
};

export type SemanticScore = { score: number; reason: string };

export type SemanticJudgeResult = {
  taskCompletion: SemanticScore;
  sourceQuality: SemanticScore;
  groundedness: SemanticScore & {
    claims: Array<{
      claim: string;
      status: 'supported' | 'partially_supported' | 'unsupported' | 'contradicted';
      sourceIds: string[];
      reason: string;
    }>;
  };
  sourceRelevance: SemanticScore;
  limitationHandling: SemanticScore;
  executionEfficiency: SemanticScore;
  overallScore: number;
  verdict: 'pass' | 'limited_pass' | 'fail';
  reviewReasons: string[];
};

export type EvalCaseResult = {
  caseId: string;
  category: EvalCategory;
  prompt: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  sessionId?: string;
  model?: string;
  provider?: string;
  answer?: string;
  events: ChatStreamEvent[];
  executions: ToolExecutionSnapshot[];
  sources: NonNullable<AssistantAgentMetadata['agent']>['sources'];
  hardRules: HardRule[];
  hardPassed: boolean;
  metrics: EvalCaseMetrics;
  judge?: SemanticJudgeResult;
  judgeError?: string;
  cleanupError?: string;
  error?: string;
};

export type EvalRunReport = {
  runId: string;
  suite: 'smoke' | 'full';
  startedAt: string;
  completedAt: string;
  cases: EvalCaseResult[];
  hardPassed: boolean;
  summary: {
    total: number;
    completed: number;
    hardPassed: number;
    hardFailed: number;
    judgeErrors: number;
    cleanupErrors: number;
    averageJudgeScore?: number;
  };
};

export type EvalSessionDetail = SessionDetail;
