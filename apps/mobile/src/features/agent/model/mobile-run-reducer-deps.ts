import type { ToolStreamEvent } from '@harness/agent-client';
import {
  normalizeSourceUrl,
  type BashPublicToolResult,
  type PersistedMessage,
} from '@harness/agent-protocol';
import {
  applyToolEvent as projectionApplyToolEvent,
  mergePendingSteerState as projectionMergePendingSteerState,
  preferRicherAssistant as projectionPreferRicherAssistant,
  toConversationItem as projectionToConversationItem,
  uniquePendingInputs as projectionUniquePendingInputs,
} from '@harness/agent-projection';
import type { RunReducerDeps } from '@harness/agent-run-state';
import type { ConversationItem, WorkbenchState } from '@harness/agent-ui-types';

function mergeWorkbenchDeliverables(
  workbench: WorkbenchState,
  previous?: WorkbenchState,
): WorkbenchState {
  if (!previous) return workbench;
  return {
    ...workbench,
    open: previous.open,
    activeView: previous.activeView,
    followMode: previous.followMode,
    focusTarget: previous.focusTarget ?? workbench.focusTarget,
  };
}

function resolveWorkbenchOpenOnToolEvent(
  existingOpen: boolean | undefined,
  _event: ToolStreamEvent,
  _options: { suppressed: boolean; hasNewResource: boolean },
): boolean {
  void _event;
  void _options;
  return existingOpen ?? false;
}

function collectedArtifactFromCommandResult(_result: BashPublicToolResult): unknown {
  void _result;
  return undefined;
}

function canonicalUrl(url: string): string {
  try {
    return normalizeSourceUrl(url);
  } catch {
    return url;
  }
}

function toConversationItem(message: PersistedMessage): ConversationItem {
  return projectionToConversationItem(message) as ConversationItem;
}

function preferRicherAssistant(
  current: ConversationItem | undefined,
  restored: ConversationItem,
): ConversationItem {
  return projectionPreferRicherAssistant(current, restored) as ConversationItem;
}

export const mobileRunReducerDeps: RunReducerDeps = {
  toConversationItem,
  preferRicherAssistant,
  mergePendingSteerState: projectionMergePendingSteerState,
  uniquePendingInputs: projectionUniquePendingInputs,
  mergeWorkbenchDeliverables,
  applyToolEvent: (
    current: WorkbenchState | undefined,
    event: ToolStreamEvent,
    open: boolean,
    currentUserUrls?: ReadonlySet<string>,
  ) =>
    projectionApplyToolEvent(
      current,
      event,
      open,
      currentUserUrls ? new Set(currentUserUrls) : undefined,
    ) as WorkbenchState,
  resolveWorkbenchOpenOnToolEvent,
  collectedArtifactFromCommandResult,
  canonicalUrl,
};
