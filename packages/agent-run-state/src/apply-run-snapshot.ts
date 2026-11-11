import type { PendingUserInputView, RunSnapshot } from '@harness/agent-protocol';
import type { AgentUiState } from '@harness/agent-ui-types';

import { snapshotActivityStatus } from './run-helpers.js';
import {
  buildSnapshotPersistedMessage,
  type ApplyRunSnapshotResult,
  type RunReducerDeps,
} from './run-reducer-deps.js';

export function applyRunSnapshotToSession(
  sessionId: string,
  sessionState: AgentUiState,
  snapshot: RunSnapshot,
  pendingInputs: PendingUserInputView[],
  cursor: number,
  deps: RunReducerDeps,
): ApplyRunSnapshotResult {
  if (snapshot.lastEventSequence < cursor) {
    return {
      skipped: true,
      nextCursor: cursor,
      sessionState,
      pendingInputs,
      sessionPending: ['queued', 'running', 'cancel_requested'].includes(snapshot.status),
    };
  }

  const active = ['queued', 'running', 'cancel_requested'].includes(snapshot.status);
  const controlStatus = snapshot.control?.state;
  const activityStatus = snapshotActivityStatus(controlStatus, snapshot.status);

  let nextPending = pendingInputs;
  let conversation = sessionState.conversation;
  if (snapshot.pendingUserInputs) {
    nextPending = deps.uniquePendingInputs(snapshot.pendingUserInputs);
    conversation = deps.mergePendingSteerState(conversation, snapshot.pendingUserInputs);
  }

  const restored = deps.toConversationItem(buildSnapshotPersistedMessage(sessionId, snapshot));
  if (restored.kind !== 'assistant') {
    return {
      nextCursor: snapshot.lastEventSequence,
      sessionState,
      pendingInputs: nextPending,
      sessionPending: active,
      errorDetail: snapshot.error?.detail,
    };
  }

  const workbenchDraft = restored.workbench
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

  const workbench = workbenchDraft
    ? deps.mergeWorkbenchDeliverables(workbenchDraft, sessionState.workbench)
    : undefined;

  const existingAssistant = conversation.find(
    (entry) => entry.kind === 'assistant' && entry.id === snapshot.assistantMessageId,
  );
  const item = {
    ...deps.preferRicherAssistant(existingAssistant, restored),
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
    nextCursor: snapshot.lastEventSequence,
    sessionState: sessionStateNext,
    pendingInputs: nextPending,
    sessionPending: active,
    errorDetail: snapshot.error?.detail,
  };
}
