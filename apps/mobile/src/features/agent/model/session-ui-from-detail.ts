import type { PersistedMessage, SessionDetail } from '@harness/agent-protocol';
import {
  mergePendingSteerState,
  preferRicherAssistant,
  toConversationItem,
  workbenchFromPersistedMessage,
} from '@harness/agent-projection';
import type { AgentUiState, ConversationItem, WorkbenchState } from '@harness/agent-ui-types';

function latestAssistantMessage(messages: PersistedMessage[]): PersistedMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') return message;
  }
  return undefined;
}

function mergeSessionWorkbench(
  session: SessionDetail,
  existing?: AgentUiState,
): WorkbenchState | undefined {
  const prior = existing?.workbench;
  const lastAssistant = latestAssistantMessage(session.messages);
  const restored = lastAssistant ? workbenchFromPersistedMessage(lastAssistant) : undefined;
  if (!restored && !session.artifactSeries?.length) {
    return prior;
  }
  const base = (restored ?? prior) as WorkbenchState | undefined;
  if (!base) return undefined;
  return {
    ...base,
    open: prior?.open ?? base.open ?? false,
    followMode: prior?.followMode ?? base.followMode ?? 'auto',
    focusTarget: prior?.focusTarget ?? base.focusTarget,
    activeView: prior?.activeView ?? base.activeView,
    ...(session.artifactSeries?.length ? { artifactSeries: session.artifactSeries } : {}),
  };
}

export function buildAgentUiStateFromSessionDetail(
  session: SessionDetail,
  existing?: AgentUiState,
): AgentUiState {
  const restored = mergePendingSteerState(
    session.messages.map(toConversationItem),
    session.pendingUserInputs,
  );
  const currentConversation = existing?.conversation ?? [];
  const conversation = restored.map((item: ConversationItem) =>
    preferRicherAssistant(
      currentConversation.find((candidate) => candidate.id === item.id),
      item,
    ),
  );

  const workbench = mergeSessionWorkbench(session, existing);

  return {
    label: session.title,
    subtitle: '',
    conversation,
    ...(workbench ? { workbench } : {}),
    ...(existing?.autoOpenSuppressedRunIds
      ? { autoOpenSuppressedRunIds: existing.autoOpenSuppressedRunIds }
      : {}),
  };
}

export function appendOptimisticRunMessages(
  state: AgentUiState,
  user: ConversationItem,
  assistant: ConversationItem,
): AgentUiState {
  return {
    ...state,
    conversation: [...state.conversation, user, assistant],
    activeRunId: undefined,
  };
}
