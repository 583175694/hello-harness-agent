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

function latestAssistantRunId(session: SessionDetail): string | undefined {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (message?.role === 'assistant' && message.runId) return message.runId;
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
  const artifactCount =
    session.artifactSeries?.reduce((sum, series) => sum + series.versions.length, 0) ?? 0;

  if (!restored && !artifactCount) {
    return prior;
  }

  let base = (restored ?? prior) as WorkbenchState | undefined;
  if (!base && artifactCount > 0) {
    const runId = latestAssistantRunId(session) ?? session.id;
    base = {
      runId,
      title: '工具执行',
      subtitle: `${artifactCount} 个文件`,
      activeView: 'tool_results',
      activityStatus: 'completed',
      executions: [],
      followMode: 'auto',
      sources: [],
      open: false,
    };
  }
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

function findExistingConversationItem(
  currentConversation: ConversationItem[],
  item: ConversationItem,
): ConversationItem | undefined {
  const byId = currentConversation.find((candidate) => candidate.id === item.id);
  if (byId) return byId;
  if (item.kind !== 'user') return undefined;
  return currentConversation.find(
    (candidate) =>
      candidate.kind === 'user' &&
      candidate.content.trim() === item.content.trim() &&
      Boolean(candidate.attachments?.length) &&
      !item.attachments?.length,
  );
}

function preferRicherUser(
  current: ConversationItem | undefined,
  restored: ConversationItem,
): ConversationItem {
  if (restored.kind !== 'user') return restored;
  if (current?.kind !== 'user') return restored;
  return {
    ...restored,
    attachments: restored.attachments?.length ? restored.attachments : current.attachments,
    skillNames: restored.skillNames?.length ? restored.skillNames : current.skillNames,
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
  const conversation = restored.map((item: ConversationItem) => {
    const current = findExistingConversationItem(currentConversation, item);
    if (item.kind === 'user') return preferRicherUser(current, item);
    return preferRicherAssistant(current, item);
  });

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
