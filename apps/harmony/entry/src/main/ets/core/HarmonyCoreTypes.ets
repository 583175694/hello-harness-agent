import { ArtifactCardRow } from '../preview/PreviewModels';
import { PlanSnapshotRow } from './HarmonyPlanProjector';

export interface SessionSummaryRow {
  id: string;
  title: string;
  status?: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedMessageRow {
  id: string;
  sessionId: string;
  role: string;
  kind: string;
  content: string;
  attachments?: FileRefRow[];
  reasoning?: string;
  metadata?: Record<string, Object>;
  runId?: string;
  deliveryStatus?: string;
  createdAt: string;
}

export interface SessionActiveRunRow {
  runId: string;
  assistantMessageId: string;
  status: string;
  lastEventSequence?: number;
}

export interface SubmitPendingInputRow {
  kind: string;
}

export interface PendingUserInputRow {
  id: string;
  kind: string;
  status: string;
  content: string;
  sequence: number;
}

export interface FileRefRow {
  fileId: string;
  fileName: string;
  mediaType: string;
  size: number;
  status: string;
  errorCode?: string;
  previewUrl?: string;
  fileKind?: string;
}

export interface SessionPaginationRow {
  limit?: number;
  hasMore?: boolean;
  nextBefore?: string;
}

export interface ArtifactRefRow {
  artifactId: string;
  fileId?: string;
  fileName?: string;
  mediaType?: string;
  fileKind?: string;
  size?: number;
  status?: string;
  seriesId?: string;
  versionNumber?: number;
  isCurrent?: boolean;
}

export interface ArtifactSeriesRow {
  seriesId: string;
  sessionId?: string;
  logicalName: string;
  currentArtifactId?: string | null;
  versions: ArtifactRefRow[];
}

export interface SessionDetailRow {
  id: string;
  title: string;
  status?: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
  messages: PersistedMessageRow[];
  pagination?: SessionPaginationRow;
  activeRun?: SessionActiveRunRow | null;
  pendingUserInputs?: PendingUserInputRow[];
  artifactSeries?: ArtifactSeriesRow[];
}

export interface RunDetailRow {
  runId: string;
  messageId: string;
  schemaVersion?: number;
  executions: Array<Record<string, Object>>;
  sources: Array<Record<string, Object>>;
  blocks: Array<Record<string, Object>>;
}

export interface CreateRunResponseRow {
  sessionId: string;
  runId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: string;
  eventsUrl: string;
}

export interface RunSnapshotRow {
  runId: string;
  sessionId: string;
  status: string;
  assistantMessageId: string;
  assistantContent?: string;
  blocks?: Array<Record<string, Object>>;
  lastEventSequence?: number;
  activeInterrupt?: Record<string, Object>;
  plan?: Record<string, Object>;
}

export interface ComposerClarificationLiveRow {
  interruptId: string;
  question: string;
  options: string[];
  allowFreeText: boolean;
}

export interface ComposerToolApprovalItemLiveRow {
  itemId: string;
  toolName: string;
  command: string;
  toolCallId: string;
  argumentsHash: string;
}

export interface ComposerToolApprovalLiveRow {
  interruptId: string;
  title: string;
  items: ComposerToolApprovalItemLiveRow[];
  sandboxNote?: string;
}

export interface RunStreamEventRow {
  seq: number;
  sessionId: string;
  runId: string;
  type: string;
  payload?: Record<string, Object>;
}

export interface LiveRunStateRow {
  sessionId: string;
  runId: string;
  userMessageId: string;
  assistantMessageId: string;
  userText: string;
  userAttachments?: FileRefRow[];
  assistantText: string;
  reasoningText: string;
  artifacts?: ArtifactCardRow[];
  deliveryStatus: string;
  cursor: number;
  composerClarification?: ComposerClarificationLiveRow;
  composerToolApproval?: ComposerToolApprovalLiveRow;
  latestToolCallId?: string;
  plan?: PlanSnapshotRow;
}

export interface PublicAgentConfigRow {
  defaultModel: string;
  models: Array<Record<string, Object>>;
}
