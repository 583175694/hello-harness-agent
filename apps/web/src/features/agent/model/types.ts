import type { AssistantContentBlock, WebFetchPassage } from '@harness/agent-protocol';
import type { ReactNode } from 'react';

export type ServiceState = 'checking' | 'ready' | 'unavailable';
export type PreviewState =
  | 'empty'
  | 'direct-answer'
  | 'tool-running'
  | 'tool-running-open'
  | 'sources'
  | 'final-report'
  | 'waiting'
  | 'steer-accepted'
  | 'cancelling'
  | 'cancelled'
  | 'limited-report'
  | 'failed'
  | 'fetch-running'
  | 'fetch-candidate'
  | 'fetch-failed';
export type WorkspaceView = 'activity' | 'sources' | 'report';
export type ActivityStatus =
  'running' | 'completed' | 'waiting' | 'cancelling' | 'cancelled' | 'failed';
export type ToolCallStatus =
  'pending' | 'running' | 'waiting' | 'cancelling' | 'completed' | 'failed' | 'cancelled';

export type WorkbenchFocusTarget =
  | { kind: 'activity'; runId: string; stepId?: string }
  | { kind: 'tool_call'; runId: string; stepId: string; toolCallId: string }
  | { kind: 'source'; runId: string; sourceId: string }
  | { kind: 'report'; runId: string };

export type ConversationItem =
  | { id: string; kind: 'user'; content: string; time?: string; createdAt?: string }
  | {
      id: string;
      kind: 'assistant';
      blocks: AssistantContentBlock[];
      pending?: boolean;
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
};

export type ReportView = { title: string; updated: string; content: ReactNode };

export type WorkbenchState = {
  runId: string;
  title: string;
  subtitle: string;
  activeView: WorkspaceView;
  activityStatus?: ActivityStatus;
  executions: ToolCallView[];
  focusTarget?: WorkbenchFocusTarget;
  followMode: 'auto' | 'pinned';
  sources: SourceView[];
  report?: ReportView;
  open: boolean;
};

export type AgentUiState = {
  label: string;
  subtitle: string;
  conversation: ConversationItem[];
  workbench?: WorkbenchState;
  autoOpenSuppressedRunIds?: string[];
};
