import type {
  AgentRunStatus,
  AssistantContentBlock,
  ResearchSourceSnapshot,
  RunSnapshot,
  RunStreamEvent,
  ToolExecutionSnapshot,
} from '@harness/agent-protocol';

export type RunProjection = {
  model: string;
  content: string;
  blocks: AssistantContentBlock[];
  executions: ToolExecutionSnapshot[];
  sources: ResearchSourceSnapshot[];
  toolCallCount: number;
};

export type ActiveRun = {
  runId: string;
  sessionId: string;
  abortController: AbortController;
  nextSequence: number;
  recentEvents: RunStreamEvent[];
  recentBytes: number;
  snapshot: RunSnapshot;
  subscribers: Set<RunSubscriber>;
};

export type RunSubscriber = {
  queue: RunStreamEvent[];
  waiting?: (result: IteratorResult<RunStreamEvent>) => void;
  closed: boolean;
};

export const ACTIVE_RUN_STATUSES: AgentRunStatus[] = [
  'queued',
  'running',
  'cancel_requested',
];

export const TERMINAL_RUN_STATUSES: AgentRunStatus[] = ['completed', 'failed', 'cancelled'];
