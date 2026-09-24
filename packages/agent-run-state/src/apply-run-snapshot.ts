import type { RunSnapshot } from '@harness/agent-protocol';
import type { AgentUiState } from '@harness/agent-ui-types';
import {
  mergePendingSteerState,
  preferRicherAssistant,
  toConversationItem,
  uniquePendingInputs,
} from '@harness/agent-projection';
import type { PendingUserInputView } from '@harness/agent-protocol';
import { snapshotActivityStatus, snapshotDeliveryStatus } from './run-helpers.js';

export type ApplyRunSnapshotResult = {
  sessionState: AgentUiState;
  pendingInputs: PendingUserInputView[];
  sessionPending: boolean;
  errorDetail?: string;
};

export function applyRunSnapshotToSession(
  sessionId: string,
  sessionState: AgentUiState,
  snapshot: RunSnapshot,
  pendingInputs: PendingUserInputView[],
): ApplyRunSnapshotResult {
  const active = ['queued', 'running', 'cancel_requested'].includes(snapshot.status);
  const controlStatus = snapshot.control?.state;
  const activityStatus = snapshotActivityStatus(controlStatus, snapshot.status);

  let nextPending = pendingInputs;
  if (snapshot.pendingUserInputs) {
    nextPending = uniquePendingInputs(snapshot.pendingUserInputs);
  }

  let conversation = sessionState.conversation;
  if (snapshot.pendingUserInputs) {
    conversation = mergePendingSteerState(conversation, snapshot.pendingUserInputs);
  }

  const restored = toConversationItem({
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
  });

  if (restored.kind !== 'assistant') {
    return {
      sessionState,
      pendingInputs: nextPending,
      sessionPending: active,
      errorDetail: snapshot.error?.detail,
    };
  }

  const workbench = restored.workbench
    ? {
        ...restored.workbench,
        runId: snapshot.runId,
        activityStatus,
        ...(snapshot.control?.phase ? { controlPhase: snapshot.control.phase } : {}),
        ...(snapshot.activeInterrupt
          ? { activeInterrupt: snapshot.activeInterrupt }
          : { activeInterrupt: undefined }),
        executions: restored.workbench.executions.map((item) => ({
          ...item,
          runId: snapshot.runId,
        })),
        ...(snapshot.context ? { context: snapshot.context } : {}),
        ...(snapshot.plan ? { plan: snapshot.plan } : {}),
      }
    : undefined;

  const existingAssistant = conversation.find(
    (entry) => entry.kind === 'assistant' && entry.id === snapshot.assistantMessageId,
  );
  const item = {
    ...preferRicherAssistant(existingAssistant, restored),
    pending: active,
    ...(workbench ? { workbench } : {}),
  };

  const exists = conversation.some(
    (entry) => entry.kind === 'assistant' && entry.id === snapshot.assistantMessageId,
  );
  conversation = exists
    ? conversation.map((entry) =>
        entry.kind === 'assistant' && entry.id === snapshot.assistantMessageId ? item : entry,
      )
    : [...conversation, item];

  const sessionStateNext: AgentUiState = {
    ...sessionState,
    conversation,
    ...(workbench ? { workbench } : {}),
    ...(snapshot.context ? { context: snapshot.context } : {}),
    ...(snapshot.activeInterrupt
      ? { activeInterrupt: snapshot.activeInterrupt }
      : { activeInterrupt: undefined }),
    ...(active ? { activeRunId: snapshot.runId } : { activeRunId: undefined }),
  };

  return {
    sessionState: sessionStateNext,
    pendingInputs: nextPending,
    sessionPending: active,
    errorDetail: snapshot.error?.detail,
  };
}
