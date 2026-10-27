import type { PendingInterruptSnapshot, PublicAgentConfig } from '@harness/agent-protocol';
import type { ReasoningEffort } from '@harness/agent-protocol';
import type { WorkbenchState } from '@harness/agent-ui-types';

import { mobileWorkbenchHasDeliverablesTab } from '../config/workbench-tabs';
import type { AgentRunUiStore } from '../model/agent-run-ui-store';
import { mapConversationToMobile } from '../model/map-conversation-to-mobile';
import {
  countWorkbenchArtifacts,
  mobileWorkbenchActivityEmphasis,
  mobileWorkbenchBadgeCount,
} from '../model/mobile-workbench-metrics';
import {
  defaultReasoningForModel,
  modelsFromPublicConfig,
} from '../model/public-config-models';
import type { SessionComposerBlock } from '../lib/session-composer-block';
import { MOBILE_STREAM_META_UI_MS } from '../config/run-ui-sync.constants';
import type { RunHostSessionStore } from './agent-host-run-session-store';
import { conversationScrollGuard } from '../lib/conversation-scroll-guard';
import { isSelectedSessionStreaming } from './run-ui-sync-coalescer';

export type RunUiSyncDeps = {
  store: RunHostSessionStore;
  runUiStore: AgentRunUiStore;
  sessionDetailActiveRunId?: string | null;
  sessionReportIds: Record<string, string>;
  publicConfig: PublicAgentConfig | null;
  defaultModelId: string | null;
  followUpSubmittingId: string | null;
  composerRevisionSeed: string | null;
  hitlSubmitting: boolean;
};

export type SyncSelectedRunUiOptions = {
  /** 流式时节流 meta；用户操作或 run 结束时应 forceMeta。 */
  forceMeta?: boolean;
};

export function createSyncSelectedRunUi(deps: RunUiSyncDeps) {
  const { store, runUiStore } = deps;
  let lastMetaSyncAt = 0;

  return function syncSelectedRunUi(options?: SyncSelectedRunUiOptions) {
    const sessionId = store.selectedSessionIdRef.current;
    const selectedState = sessionId ? store.sessionStatesRef.current[sessionId] : undefined;

    const mapped = mapConversationToMobile(selectedState?.conversation ?? []);

    const publishConversationUi = () => {
      const previousConversation = runUiStore.getConversation();
      if (
        previousConversation.length === mapped.length &&
        previousConversation.every((item, index) => item === mapped[index])
      ) {
        return;
      }
      if (
        previousConversation.length > 0 &&
        previousConversation.length === mapped.length &&
        previousConversation
          .slice(0, -1)
          .every((item, index) => item === mapped[index])
      ) {
        const tail = mapped[mapped.length - 1];
        if (tail) runUiStore.publishConversationTail(tail);
        return;
      }
      runUiStore.publishConversation(mapped);
    };

    conversationScrollGuard.deferWhileScrolling(publishConversationUi);

    const streaming = isSelectedSessionStreaming(store);
    const now = Date.now();
    const shouldSyncMeta =
      options?.forceMeta || !streaming || now - lastMetaSyncAt >= MOBILE_STREAM_META_UI_MS;
    if (!shouldSyncMeta) {
      return;
    }
    lastMetaSyncAt = now;

    const workbench: WorkbenchState | undefined = selectedState?.workbench;
    const workbenchReportId = sessionId ? deps.sessionReportIds[sessionId] : undefined;
    const activeRunId = selectedState?.activeRunId ?? deps.sessionDetailActiveRunId ?? null;
    const workbenchCount = mobileWorkbenchBadgeCount({
      workbench,
      conversation: selectedState?.conversation ?? [],
      activeRunId,
    });
    const artifactCount = countWorkbenchArtifacts(workbench);
    const hasDeliverables = mobileWorkbenchHasDeliverablesTab({
      workbenchCount,
      hasDeliverables:
        artifactCount > 0 || Boolean(workbench?.report) || Boolean(workbenchReportId),
    });
    const activityEmphasis = mobileWorkbenchActivityEmphasis(workbench);

    runUiStore.publishWorkbench({
      workbench,
      workbenchReportId,
      workbenchCount,
      hasDeliverables,
      activityEmphasis,
      activeRunId,
    });

    const composerModels = deps.publicConfig ? modelsFromPublicConfig(deps.publicConfig) : [];
    const defaultReasoningEffort: ReasoningEffort = deps.publicConfig
      ? defaultReasoningForModel(
          deps.publicConfig,
          deps.defaultModelId ?? deps.publicConfig.defaultModel ?? deps.publicConfig.models[0]?.id ?? '',
        )
      : 'high';
    const composerPlan = selectedState?.workbench?.plan?.plan;
    const composerPlanExplanation = selectedState?.workbench?.plan?.explanation;
    const followUpItems = store.pendingInputsRef.current
      .filter((input) => input.kind === 'follow_up' && input.status === 'pending')
      .map((input) => ({ id: input.id, content: input.content }));
    const rawInterrupt = selectedState?.activeInterrupt;
    const activeInterrupt: PendingInterruptSnapshot | null =
      rawInterrupt?.status === 'pending' ? (rawInterrupt as PendingInterruptSnapshot) : null;
    const runSubmitting = sessionId ? Boolean(store.pendingSessionsRef.current[sessionId]) : false;
    const composerBlock: SessionComposerBlock | null = sessionId
      ? (store.composerBlocks[sessionId] ?? null)
      : null;

    runUiStore.publishComposer({
      runSubmitting,
      defaultModelId: deps.defaultModelId,
      defaultReasoningEffort,
      composerModels,
      composerPlan,
      composerPlanExplanation,
      followUpItems,
      followUpSubmittingId: deps.followUpSubmittingId,
      composerRevisionSeed: deps.composerRevisionSeed,
      composerBlock,
      activeInterrupt,
      hitlSubmitting: deps.hitlSubmitting,
    });
  };
}
