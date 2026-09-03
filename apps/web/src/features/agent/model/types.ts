import type {
  AssistantContentBlock,
  InterruptSnapshot,
  PendingUserInputView,
  RunContextDebug,
  SourceProvenance,
  WebFetchPassage,
} from '@harness/agent-protocol';
import type { PlanSnapshot } from '@harness/agent-protocol';
import type { ReactNode } from 'react';

export type ServiceState = 'checking' | 'ready' | 'unavailable';
export type PreviewState =
  | 'empty'
  | 'direct-answer'
  | 'tool-running'
  | 'tool-running-open'
  | 'plan-running'
  | 'plan-cleared'
  | 'plan-completed'
  | 'sources'
  | 'final-report'
  | 'waiting'
  | 'steer-accepted'
  | 'steer-pending'
  | 'follow-up-pending'
  | 'queued'
  | 'pause-requested'
  | 'paused'
  | 'resuming'
  | 'clarification'
  | 'tool-approval'
  | 'final-answer'
  | 'cancel-requested'
  | 'cancelling'
  | 'cancelled'
  | 'limited-report'
  | 'failed'
  | 'fetch-running'
  | 'fetch-candidate'
  | 'fetch-failed';
export type WorkspaceView = 'activity' | 'context' | 'sources' | 'report' | 'plan';
export type ActivityStatus =
  | 'queued'
  | 'final_answer'
  | 'running'
  | 'completed'
  | 'waiting'
  | 'pause_requested'
  | 'paused'
  | 'resuming'
  | 'waiting_for_user'
  | 'cancelling'
  | 'cancelled'
  | 'failed';
export type ToolCallStatus =
  'pending' | 'running' | 'waiting' | 'cancelling' | 'completed' | 'failed' | 'cancelled';

export type WorkbenchFocusTarget =
  | { kind: 'activity'; runId: string; stepId?: string }
  | { kind: 'tool_call'; runId: string; stepId: string; toolCallId: string }
  | { kind: 'source'; runId: string; sourceId: string }
  | { kind: 'report'; runId: string };

export type ConversationItem =
  | {
      id: string;
      kind: 'user';
      content: string;
      time?: string;
      createdAt?: string;
      pendingInputId?: string;
      pendingState?: 'steer_pending' | 'steer_applied' | 'follow_up_pending';
    }
  | {
      id: string;
      kind: 'assistant';
      blocks: AssistantContentBlock[];
      pending?: boolean;
      deliveryStatus?: 'streaming' | 'completed' | 'failed' | 'cancelled';
      time?: string;
      createdAt?: string;
      workbench?: WorkbenchState;
    };

export type ToolCallView = {
  toolCallId: string;
  runId: string;
  stepId: string;
  toolName: string;
  title: string;
  detail: string;
  status: ToolCallStatus;
  elapsed: string;
  inputSummary: string;
  outputSummary?: string;
  resultCount?: number;
  sourceCount?: number;
};

export type SourceView = {
  id: string;
  title: string;
  domain: string;
  url: string;
  excerpt: string;
  time: string;
  provider?: string;
  kind?: 'clue' | 'fetched';
  used?: boolean;
  author?: string;
  publishedAt?: string;
  contentType?: string;
  cacheStatus?: 'hit' | 'miss';
  truncated?: boolean;
  passages?: WebFetchPassage[];
  provenance?: SourceProvenance;
  requestedUrl?: string;
  normalizedUrl?: string;
  contentHash?: string;
  toolCallIds?: string[];
};

export type ReportView = { title: string; updated: string; content: ReactNode };

export type WorkbenchState = {
  runId: string;
  title: string;
  subtitle: string;
  activeView: WorkspaceView;
  activityStatus?: ActivityStatus;
  controlPhase?: 'tool_loop' | 'final_answer' | 'terminal';
  activeInterrupt?: InterruptSnapshot;
  executions: ToolCallView[];
  focusTarget?: WorkbenchFocusTarget;
  followMode: 'auto' | 'pinned';
  sources: SourceView[];
  context?: RunContextDebug;
  // 服务端下发的最新计划；前端不从文本或工具活动推断此字段。
  plan?: PlanSnapshot;
  report?: ReportView;
  open: boolean;
};

export type AgentUiState = {
  label: string;
  subtitle: string;
  conversation: ConversationItem[];
  workbench?: WorkbenchState;
  autoOpenSuppressedRunIds?: string[];
  activeRunId?: string;
  activeInterrupt?: InterruptSnapshot;
  context?: RunContextDebug;
  pendingInputs?: PendingUserInputView[];
  previewSubmitting?: boolean;
};
