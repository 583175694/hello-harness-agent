import type {
  BashPublicToolResult,
  PendingUserInputView,
  PersistedMessage,
  RunSnapshot,
} from '@harness/agent-protocol';
import { snapshotDeliveryStatus } from './run-helpers.js';
import type { ToolStreamEvent } from '@harness/agent-client';
import type { AgentUiState, ConversationItem, WorkbenchState } from '@harness/agent-ui-types';

export type RunReducerDeps = {
  toConversationItem: (message: PersistedMessage) => ConversationItem;
  preferRicherAssistant: (
    current: ConversationItem | undefined,
    restored: ConversationItem,
  ) => ConversationItem;
  mergePendingSteerState: (
    conversation: ConversationItem[],
    pendingInputs: PendingUserInputView[],
  ) => ConversationItem[];
  uniquePendingInputs: (items: PendingUserInputView[]) => PendingUserInputView[];
  mergeWorkbenchDeliverables: (
    workbench: WorkbenchState,
    previous?: WorkbenchState,
  ) => WorkbenchState;
  applyToolEvent: (
    current: WorkbenchState | undefined,
    event: ToolStreamEvent,
    open: boolean,
    currentUserUrls?: ReadonlySet<string>,
  ) => WorkbenchState;
  resolveWorkbenchOpenOnToolEvent: (
    existingOpen: boolean | undefined,
    event: ToolStreamEvent,
    options: { suppressed: boolean; hasNewResource: boolean },
  ) => boolean;
  collectedArtifactFromCommandResult: (result: BashPublicToolResult) => unknown;
  canonicalUrl: (url: string) => string;
};

export type ApplyRunSnapshotResult = {
  skipped?: boolean;
  nextCursor: number;
  sessionState: AgentUiState;
  pendingInputs: PendingUserInputView[];
  sessionPending: boolean;
  errorDetail?: string;
};

export type ApplyRunEventResult = {
  sessionState: AgentUiState;
  pendingInputs: PendingUserInputView[];
  sessionPending: boolean;
  nextCursor: number;
  errorDetail?: string;
  duplicate?: boolean;
  gap?: boolean;
};

export function buildSnapshotPersistedMessage(
  sessionId: string,
  snapshot: RunSnapshot,
): PersistedMessage {
  return {
    id: snapshot.assistantMessageId,
    sessionId,
    role: 'assistant',
    kind: 'assistant_delivery',
    content: snapshot.assistantContent,
    runId: snapshot.runId,
    deliveryStatus: snapshotDeliveryStatus(snapshot.status),
    createdAt: snapshot.createdAt,
    metadata: {
      model: 'restored',
      deliveryStatus: snapshotDeliveryStatus(snapshot.status),
      runId: snapshot.runId,
      blocks: snapshot.blocks,
      ...(snapshot.error &&
      typeof snapshot.error.code === 'string' &&
      typeof snapshot.error.detail === 'string'
        ? { error: { code: snapshot.error.code, detail: snapshot.error.detail } }
        : {}),
      agent: {
        toolCallCount: snapshot.toolCallCount,
        executions: snapshot.executions,
        sources: snapshot.sources,
      },
    },
  } as PersistedMessage;
}
