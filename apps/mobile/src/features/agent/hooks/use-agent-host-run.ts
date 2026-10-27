import { ApiProblem, type AgentClient } from '@harness/agent-client';
import type {
  PendingUserInputView,
  PublicAgentConfig,
  SessionDetail,
} from '@harness/agent-protocol';
import type { AgentUiState } from '@harness/agent-ui-types';
import { uniquePendingInputs } from '@harness/agent-projection';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ConnectionState } from '../components/connection-pill';
import type { AgentRunUiStore } from '../model/agent-run-ui-store';
import { buildAgentUiStateFromSessionDetail } from '../model/session-ui-from-detail';
import { inferLatestReportArtifactId } from '../model/resolve-report-artifact';
import { notifyRunAttention } from '@/lib/run-local-notifications';
import { loadSessionReportIds, saveSessionReportId } from '@/lib/storage';
import { useAppStateRunLifecycle } from './use-app-state-run-lifecycle';
import {
  isSessionComposerBlockCode,
  type SessionComposerBlock,
} from '../lib/session-composer-block';
import { createRunCommands } from './agent-host-run-commands';
import { createRunStreamHandlers } from './agent-host-run-stream';
import { createSyncSelectedRunUi } from './agent-host-run-sync-ui';
import { createRunUiSyncCoalescer } from './run-ui-sync-coalescer';

type UseAgentHostRunParams = {
  client: AgentClient;
  serviceReady: boolean;
  selectedSessionId: string | null;
  sessionDetail: SessionDetail | null;
  refreshSessions: () => Promise<void>;
  reloadSessionDetail: (sessionId: string) => Promise<void>;
  createSession: (title?: string) => Promise<{ id: string } | null>;
  ensureSessionSelected: (sessionId: string) => void;
  pushNotificationsEnabled: boolean;
  runUiStore: AgentRunUiStore;
};

export function useAgentHostRun({
  client,
  serviceReady,
  selectedSessionId,
  sessionDetail,
  refreshSessions,
  reloadSessionDetail,
  createSession,
  ensureSessionSelected,
  pushNotificationsEnabled,
  runUiStore,
}: UseAgentHostRunParams) {
  const pushNotificationsEnabledRef = useRef(pushNotificationsEnabled);
  pushNotificationsEnabledRef.current = pushNotificationsEnabled;

  const sessionStatesRef = useRef<Record<string, AgentUiState>>({});
  const runSequencesRef = useRef<Record<string, number>>({});
  const runControllersRef = useRef<Record<string, AbortController>>({});
  const reportHydratedSessionsRef = useRef<Set<string>>(new Set());
  const pendingInputsRef = useRef<PendingUserInputView[]>([]);
  const pendingSessionsRef = useRef<Record<string, boolean>>({});
  const selectedSessionIdRef = useRef<string | null>(selectedSessionId);

  const [sessionReportIds, setSessionReportIds] = useState<Record<string, string>>({});
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [reconnectRunId, setReconnectRunId] = useState<string | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicAgentConfig | null>(null);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [hitlSubmitting, setHitlSubmitting] = useState(false);
  const [followUpSubmittingId, setFollowUpSubmittingId] = useState<string | null>(null);
  const [composerRevisionSeed, setComposerRevisionSeed] = useState<string | null>(null);
  const [composerBlocks, setComposerBlocks] = useState<Record<string, SessionComposerBlock>>({});

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  const sessionStoreRef = useMemo(
    () => ({
      sessionStatesRef,
      runSequencesRef,
      runControllersRef,
      pendingInputsRef,
      pendingSessionsRef,
      selectedSessionIdRef,
      setSessionPending: () => {},
      setSessionState: () => {},
      composerBlocks,
      setComposerBlocks,
    }),
    [composerBlocks, setComposerBlocks],
  );

  const syncSelectedRunUi = useMemo(
    () =>
      createSyncSelectedRunUi({
        store: sessionStoreRef,
        runUiStore,
        sessionDetailActiveRunId: sessionDetail?.activeRun?.runId,
        sessionReportIds,
        publicConfig,
        defaultModelId,
        followUpSubmittingId,
        composerRevisionSeed,
        hitlSubmitting,
      }),
    [
      composerRevisionSeed,
      defaultModelId,
      followUpSubmittingId,
      hitlSubmitting,
      publicConfig,
      runUiStore,
      sessionDetail?.activeRun?.runId,
      sessionReportIds,
      sessionStoreRef,
    ],
  );

  const runUiSync = useMemo(
    () =>
      createRunUiSyncCoalescer({
        sync: syncSelectedRunUi,
        store: {
          selectedSessionIdRef,
          sessionStatesRef,
          pendingSessionsRef,
        },
      }),
    [syncSelectedRunUi],
  );

  const flushRunUiSync = useCallback(
    (options?: { forceMeta?: boolean }) => {
      runUiSync.flush(options);
    },
    [runUiSync],
  );

  const setSessionPending = useCallback(
    (sessionId: string, pending: boolean) => {
      pendingSessionsRef.current[sessionId] = pending;
      if (sessionId === selectedSessionIdRef.current) {
        runUiSync.schedule('coalesced');
      }
    },
    [runUiSync],
  );

  const setSessionState = useCallback(
    (sessionId: string, next: AgentUiState) => {
      sessionStatesRef.current[sessionId] = next;
      if (sessionId === selectedSessionIdRef.current) {
        runUiSync.schedule('coalesced');
      }
    },
    [runUiSync],
  );

  useEffect(() => {
    flushRunUiSync({ forceMeta: true });
  }, [selectedSessionId, flushRunUiSync]);

  useEffect(() => () => runUiSync.cancel(), [runUiSync]);

  useEffect(() => {
    runUiStore.publishConnection(connectionState);
  }, [connectionState, runUiStore]);

  const maybeNotifyRunAttention = useCallback(
    (
      sessionId: string,
      kind: 'completed' | 'failed' | 'clarification' | 'tool_approval',
      detail?: string,
    ) => {
      const state = sessionStatesRef.current[sessionId];
      const sessionTitle = state?.label?.trim() || '会话';
      void notifyRunAttention({
        enabled: pushNotificationsEnabledRef.current,
        sessionId,
        sessionTitle,
        kind,
        detail,
      });
    },
    [],
  );

  const maybeNotifyPendingInterrupt = useCallback(
    (sessionId: string, state: AgentUiState) => {
      const interrupt = state.activeInterrupt;
      if (interrupt?.status !== 'pending') return;
      if (interrupt.kind === 'clarification') {
        maybeNotifyRunAttention(sessionId, 'clarification');
      } else if (interrupt.kind === 'tool_approval') {
        maybeNotifyRunAttention(sessionId, 'tool_approval');
      }
    },
    [maybeNotifyRunAttention],
  );

  const setComposerBlockForSession = useCallback(
    (sessionId: string, block: SessionComposerBlock | null) => {
      setComposerBlocks((prev) => {
        if (!block) {
          if (!(sessionId in prev)) return prev;
          const next = { ...prev };
          delete next[sessionId];
          return next;
        }
        return { ...prev, [sessionId]: block };
      });
      flushRunUiSync({ forceMeta: true });
    },
    [flushRunUiSync],
  );

  const applyComposerBlockFromError = useCallback(
    (sessionId: string, error: unknown): string | null => {
      if (!(error instanceof ApiProblem)) return null;
      const code = error.problem.code;
      if (!isSessionComposerBlockCode(code)) return null;
      setComposerBlockForSession(sessionId, {
        code: code ?? 'SESSION_BLOCKED',
        detail: error.problem.detail,
      });
      return error.problem.detail;
    },
    [setComposerBlockForSession],
  );

  useEffect(() => {
    void loadSessionReportIds().then((stored) => {
      setSessionReportIds((current) => ({ ...stored, ...current }));
    });
  }, []);

  useEffect(() => {
    if (!serviceReady) return;
    void client
      .getPublicAgentConfig()
      .then((config) => {
        setPublicConfig(config);
        setDefaultModelId(config.defaultModel ?? config.models[0]?.id ?? null);
      })
      .catch(() => undefined);
  }, [client, serviceReady]);

  const stream = useMemo(
    () =>
      createRunStreamHandlers({
        client,
        store: {
          sessionStatesRef,
          runSequencesRef,
          runControllersRef,
          pendingInputsRef,
          pendingSessionsRef,
          selectedSessionIdRef,
          setSessionPending,
          setSessionState,
          composerBlocks,
          setComposerBlocks,
        },
        refreshSessions,
        setConnectionState,
        setReconnectRunId,
        reconnectRunId,
        selectedSessionId,
        sessionDetailActiveRunId: sessionDetail?.activeRun?.runId,
        maybeNotifyRunAttention,
        maybeNotifyPendingInterrupt,
        setSessionPending,
        setSessionState,
        setSessionReportIds,
      }),
    [
      client,
      composerBlocks,
      maybeNotifyPendingInterrupt,
      maybeNotifyRunAttention,
      reconnectRunId,
      refreshSessions,
      selectedSessionId,
      sessionDetail?.activeRun?.runId,
      setSessionPending,
      setSessionState,
    ],
  );

  const { observeRun, hydrateLatestRunSnapshot, applyRunSnapshot } = stream;

  useEffect(() => {
    if (!sessionDetail || !selectedSessionId || sessionDetail.id !== selectedSessionId) return;

    const sessionId = sessionDetail.id;
    const runLive = Boolean(pendingSessionsRef.current[sessionId] || sessionDetail.activeRun);

    pendingInputsRef.current = uniquePendingInputs(sessionDetail.pendingUserInputs);

    if (!runLive) {
      const next = buildAgentUiStateFromSessionDetail(
        sessionDetail,
        sessionStatesRef.current[sessionId],
      );
      setSessionState(sessionId, next);
    } else {
      flushRunUiSync({ forceMeta: true });
    }

    if (
      !sessionReportIds[sessionId] &&
      !reportHydratedSessionsRef.current.has(sessionId)
    ) {
      reportHydratedSessionsRef.current.add(sessionId);
      const artifactId = inferLatestReportArtifactId(sessionDetail);
      if (artifactId) {
        void client
          .getReportForArtifact(artifactId)
          .then((bundle) => {
            const reportId = bundle.report.reportId;
            setSessionReportIds((current) => ({
              ...current,
              [sessionId]: reportId,
            }));
            void saveSessionReportId(sessionId, reportId);
          })
          .catch(() => undefined);
      }
    }

    if (sessionDetail.activeRun) {
      setSessionPending(sessionId, true);
      void observeRun(sessionId, sessionDetail.activeRun.runId);
    } else {
      setConnectionState('idle');
      const latestRunId = [...sessionDetail.messages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.runId)?.runId;
      if (latestRunId) {
        void hydrateLatestRunSnapshot(sessionId, latestRunId);
      }
    }
  }, [
    observeRun,
    selectedSessionId,
    sessionDetail,
    sessionDetail?.activeRun?.runId,
    sessionDetail?.id,
    sessionReportIds,
    client,
    hydrateLatestRunSnapshot,
    setSessionPending,
    setSessionState,
    flushRunUiSync,
  ]);

  useEffect(() => {
    if (!reconnectRunId || !selectedSessionId) return;
    const session = sessionStatesRef.current[selectedSessionId];
    if (session?.activeRunId === reconnectRunId) {
      void observeRun(selectedSessionId, reconnectRunId);
    }
  }, [observeRun, reconnectRunId, selectedSessionId]);

  useEffect(() => {
    return () => {
      Object.values(runControllersRef.current).forEach((controller) => controller.abort());
      runControllersRef.current = {};
    };
  }, []);

  useAppStateRunLifecycle({
    onBackground: () => {
      stream.abortAllRunObservers();
      void stream.pollPendingRunsSnapshot();
      stream.startBackgroundRunPolling();
    },
    onForeground: () => {
      stream.stopBackgroundRunPolling();
      stream.resumeActiveRunObserver();
    },
  });

  useEffect(() => () => stream.stopBackgroundRunPolling(), [stream]);

  const commands = useMemo(
    () =>
      createRunCommands({
        client,
        store: {
          sessionStatesRef,
          runSequencesRef,
          runControllersRef,
          pendingInputsRef,
          pendingSessionsRef,
          selectedSessionIdRef,
          setSessionPending,
          setSessionState,
          composerBlocks,
          setComposerBlocks,
        },
        defaultModelId,
        sessionDetailActiveRunId: sessionDetail?.activeRun?.runId,
        createSession,
        ensureSessionSelected,
        refreshSessions,
        reloadSessionDetail,
        setConnectionState,
        setFollowUpSubmittingId,
        setHitlSubmitting,
        setComposerRevisionSeed,
        setSessionPending,
        setSessionState,
        syncSelectedRunUi: () => flushRunUiSync({ forceMeta: true }),
        applyComposerBlockFromError,
        observeRun,
        applyRunSnapshot,
      }),
    [
      applyComposerBlockFromError,
      applyRunSnapshot,
      client,
      composerBlocks,
      createSession,
      defaultModelId,
      ensureSessionSelected,
      flushRunUiSync,
      observeRun,
      refreshSessions,
      reloadSessionDetail,
      sessionDetail?.activeRun?.runId,
      setSessionPending,
      setSessionState,
    ],
  );

  const dismissComposerBlock = useCallback(() => {
    if (!selectedSessionId) return;
    setComposerBlockForSession(selectedSessionId, null);
  }, [selectedSessionId, setComposerBlockForSession]);

  const workbenchSnapshot = runUiStore.getWorkbench();
  const composerSnapshot = runUiStore.getComposer();

  return {
    conversation: runUiStore.getConversation(),
    connectionState: runUiStore.getConnection(),
    runSubmitting: composerSnapshot.runSubmitting,
    defaultModelId: composerSnapshot.defaultModelId,
    defaultReasoningEffort: composerSnapshot.defaultReasoningEffort,
    publicConfig,
    composerModels: composerSnapshot.composerModels,
    composerPlan: composerSnapshot.composerPlan,
    composerPlanExplanation: composerSnapshot.composerPlanExplanation,
    followUpItems: composerSnapshot.followUpItems,
    followUpSubmittingId: composerSnapshot.followUpSubmittingId,
    composerRevisionSeed: composerSnapshot.composerRevisionSeed,
    composerBlock: composerSnapshot.composerBlock,
    dismissComposerBlock,
    activeInterrupt: composerSnapshot.activeInterrupt,
    hitlSubmitting: composerSnapshot.hitlSubmitting,
    workbench: workbenchSnapshot.workbench,
    workbenchReportId: workbenchSnapshot.workbenchReportId,
    workbenchCount: workbenchSnapshot.workbenchCount,
    hasDeliverables: workbenchSnapshot.hasDeliverables,
    activityEmphasis: workbenchSnapshot.activityEmphasis,
    respondClarification: commands.respondClarification,
    respondToolApproval: commands.respondToolApproval,
    submitRun: commands.submitRun,
    sendFollowUp: commands.sendFollowUp,
    cancelFollowUp: commands.cancelFollowUp,
    beginArtifactRevision: commands.beginArtifactRevision,
    restoreArtifactVersion: commands.restoreArtifactVersion,
    pauseActiveRun: commands.pauseActiveRun,
    resumeActiveRun: commands.resumeActiveRun,
    cancelActiveRun: commands.cancelActiveRun,
    activeRunId: workbenchSnapshot.activeRunId,
  };
}
