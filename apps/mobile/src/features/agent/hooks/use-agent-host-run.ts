import { ApiProblem, createClientId, type AgentClient, type ToolStreamEvent } from '@harness/agent-client';
import { observeRunConnection } from '@harness/agent-conversation';
import type {
  ArtifactRef,
  PendingUserInputView,
  PendingInterruptSnapshot,
  PublicAgentConfig,
  RunSnapshot,
  RunStreamEvent,
  SessionDetail,
  ToolApprovalDecision,
} from '@harness/agent-protocol';
import { uniquePendingInputs } from '@harness/agent-projection';
import {
  applyRunEventToSession,
  applyRunSnapshotToSession,
} from '@harness/agent-run-state';
import type { AgentUiState, ConversationItem, WorkbenchState } from '@harness/agent-ui-types';
import { mobileWorkbenchHasDeliverablesTab } from '../config/workbench-tabs';
import {
  countWorkbenchArtifacts,
  mobileWorkbenchActivityEmphasis,
  mobileWorkbenchBadgeCount,
} from '../model/mobile-workbench-metrics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import type { ConnectionState } from '../components/connection-pill';
import type { AgentRunUiStore } from '../model/agent-run-ui-store';
import { mapConversationToMobile } from '../model/map-conversation-to-mobile';
import { mobileRunReducerDeps } from '../model/mobile-run-reducer-deps';
import type { ComposerSubmitPayload } from '../model/composer-submit.types';
import {
  defaultReasoningForModel,
  modelsFromPublicConfig,
} from '../model/public-config-models';
import type { ReasoningEffort } from '@harness/agent-protocol';
import { buildAgentUiStateFromSessionDetail } from '../model/session-ui-from-detail';
import { inferLatestReportArtifactId } from '../model/resolve-report-artifact';
import { notifyRunAttention } from '@/lib/run-local-notifications';
import { loadSessionReportIds, saveSessionReportId } from '@/lib/storage';
import { BACKGROUND_RUN_SNAPSHOT_POLL_MS } from '../config/run-lifecycle.constants';
import { useAppStateRunLifecycle } from './use-app-state-run-lifecycle';
import {
  isSessionComposerBlockCode,
  type SessionComposerBlock,
} from '../lib/session-composer-block';

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

  const syncSelectedRunUi = useCallback(() => {
    const sessionId = selectedSessionIdRef.current;
    const selectedState = sessionId ? sessionStatesRef.current[sessionId] : undefined;

    const mapped = mapConversationToMobile(selectedState?.conversation ?? []);
    const previousConversation = runUiStore.getConversation();
    if (
      previousConversation.length !== mapped.length ||
      !previousConversation.every((item, index) => item === mapped[index])
    ) {
      runUiStore.publishConversation(mapped);
    }

    const workbench: WorkbenchState | undefined = selectedState?.workbench;
    const workbenchReportId = sessionId ? sessionReportIds[sessionId] : undefined;
    const activeRunId = selectedState?.activeRunId ?? sessionDetail?.activeRun?.runId ?? null;
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

    const composerModels = publicConfig ? modelsFromPublicConfig(publicConfig) : [];
    const defaultReasoningEffort: ReasoningEffort = publicConfig
      ? defaultReasoningForModel(
          publicConfig,
          defaultModelId ?? publicConfig.defaultModel ?? publicConfig.models[0]?.id ?? '',
        )
      : 'high';
    const composerPlan = selectedState?.workbench?.plan?.plan;
    const composerPlanExplanation = selectedState?.workbench?.plan?.explanation;
    const followUpItems = pendingInputsRef.current
      .filter((input) => input.kind === 'follow_up' && input.status === 'pending')
      .map((input) => ({ id: input.id, content: input.content }));
    const rawInterrupt = selectedState?.activeInterrupt;
    const activeInterrupt: PendingInterruptSnapshot | null =
      rawInterrupt?.status === 'pending' ? (rawInterrupt as PendingInterruptSnapshot) : null;
    const runSubmitting = sessionId ? Boolean(pendingSessionsRef.current[sessionId]) : false;
    const composerBlock = sessionId ? (composerBlocks[sessionId] ?? null) : null;

    runUiStore.publishComposer({
      runSubmitting,
      defaultModelId,
      defaultReasoningEffort,
      composerModels,
      composerPlan,
      composerPlanExplanation,
      followUpItems,
      followUpSubmittingId,
      composerRevisionSeed,
      composerBlock,
      activeInterrupt,
      hitlSubmitting,
    });
  }, [
    composerBlocks,
    composerRevisionSeed,
    defaultModelId,
    followUpSubmittingId,
    hitlSubmitting,
    publicConfig,
    runUiStore,
    sessionDetail?.activeRun?.runId,
    sessionReportIds,
  ]);

  useEffect(() => {
    syncSelectedRunUi();
  }, [selectedSessionId, syncSelectedRunUi]);

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
      syncSelectedRunUi();
    },
    [syncSelectedRunUi],
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

  const setSessionPending = useCallback(
    (sessionId: string, pending: boolean) => {
      pendingSessionsRef.current = { ...pendingSessionsRef.current, [sessionId]: pending };
      if (sessionId === selectedSessionIdRef.current) {
        syncSelectedRunUi();
      }
    },
    [syncSelectedRunUi],
  );

  const setSessionState = useCallback(
    (sessionId: string, next: AgentUiState) => {
      sessionStatesRef.current = { ...sessionStatesRef.current, [sessionId]: next };
      if (sessionId === selectedSessionIdRef.current) {
        syncSelectedRunUi();
      }
    },
    [syncSelectedRunUi],
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

  const applyRunSnapshot = useCallback(
    (sessionId: string, snapshot: RunSnapshot) => {
      const target = sessionStatesRef.current[sessionId];
      if (!target) return;
      const cursor = runSequencesRef.current[snapshot.runId] ?? 0;
      const result = applyRunSnapshotToSession(
        sessionId,
        target,
        snapshot,
        pendingInputsRef.current,
        cursor,
        mobileRunReducerDeps,
      );
      if (result.skipped) return;
      runSequencesRef.current[snapshot.runId] = result.nextCursor;
      pendingInputsRef.current = result.pendingInputs;
      setSessionPending(sessionId, result.sessionPending);
      setSessionState(sessionId, result.sessionState);
      setConnectionState('live');
      maybeNotifyPendingInterrupt(sessionId, result.sessionState);
    },
    [maybeNotifyPendingInterrupt, setSessionPending, setSessionState],
  );

  const applyRunEvent = useCallback(
    (sessionId: string, event: RunStreamEvent, task = '') => {
      if (event.type === 'run.snapshot') {
        applyRunSnapshot(sessionId, event.payload as RunSnapshot);
        return;
      }
      const target = sessionStatesRef.current[sessionId];
      if (!target) throw new Error('RUN_EVENT_TARGET_MISSING');
      const cursor = runSequencesRef.current[event.runId] ?? 0;
      const result = applyRunEventToSession(
        sessionId,
        target,
        pendingInputsRef.current,
        pendingSessionsRef.current[sessionId] ?? false,
        event,
        cursor,
        task,
        mobileRunReducerDeps,
      );
      if (result.duplicate) return;
      if (result.gap) throw new Error('RUN_EVENT_SEQUENCE_GAP');
      if (event.type === 'tool.completed') {
        const toolEvent = event as unknown as ToolStreamEvent;
        if (toolEvent.type === 'tool.completed' && toolEvent.toolName === 'create_report') {
          const reportId = toolEvent.result.report.reportId;
          setSessionReportIds((current) => ({
            ...current,
            [sessionId]: reportId,
          }));
          void saveSessionReportId(sessionId, reportId);
        }
      }
      runSequencesRef.current[event.runId] = result.nextCursor;
      pendingInputsRef.current = result.pendingInputs;
      setSessionPending(sessionId, result.sessionPending);
      setSessionState(sessionId, result.sessionState);
      setConnectionState('live');
      maybeNotifyPendingInterrupt(sessionId, result.sessionState);
    },
    [applyRunSnapshot, maybeNotifyPendingInterrupt, setSessionPending, setSessionState],
  );

  const observeRun = useCallback(
    async (
      sessionId: string,
      runId: string,
      task = '',
      skipInitialSnapshot = false,
    ): Promise<void> => {
      if (runControllersRef.current[runId]) return;
      const controller = new AbortController();
      runControllersRef.current[runId] = controller;
      setReconnectRunId((current) => (current === runId ? null : current));
      setConnectionState('connecting');
      let terminalObserved = false;
      try {
        const outcome = await observeRunConnection(
          sessionId,
          runId,
          {
            getRun: (activeRunId, signal) => client.getRun(activeRunId, signal),
            subscribeRun: (activeRunId, cursor, onEvent, signal) =>
              client.subscribeRun(activeRunId, cursor, onEvent, signal),
            getCursor: (activeRunId) => runSequencesRef.current[activeRunId],
            applySnapshot: applyRunSnapshot,
            applyEvent: applyRunEvent,
          },
          { task, skipInitialSnapshot, signal: controller.signal },
        );
        terminalObserved = outcome.terminalObserved;
        if (terminalObserved) {
          setConnectionState('idle');
        } else if (!controller.signal.aborted) {
          setConnectionState('reconnecting');
          setReconnectRunId(runId);
        }
      } catch {
        if (!controller.signal.aborted) {
          setConnectionState('offline');
          setReconnectRunId(runId);
        }
      } finally {
        delete runControllersRef.current[runId];
        if (!controller.signal.aborted) {
          try {
            if (terminalObserved) {
              setReconnectRunId(null);
              setSessionPending(sessionId, false);
              const state = sessionStatesRef.current[sessionId];
              const lastAssistant = state?.conversation
                .filter((item) => item.kind === 'assistant')
                .at(-1);
              const status =
                lastAssistant?.kind === 'assistant' ? lastAssistant.deliveryStatus : undefined;
              if (status === 'completed') {
                maybeNotifyRunAttention(sessionId, 'completed');
              } else if (status === 'failed' || status === 'cancelled') {
                maybeNotifyRunAttention(
                  sessionId,
                  'failed',
                  lastAssistant?.kind === 'assistant' ? lastAssistant.error?.detail : undefined,
                );
              }
              await refreshSessions();
            } else {
              const snapshot = await client.getRun(runId);
              applyRunSnapshot(sessionId, snapshot);
            }
          } catch {
            // Run 已持久化；刷新失败保留当前投影。
          }
        }
      }
    },
    [applyRunEvent, applyRunSnapshot, client, maybeNotifyRunAttention, refreshSessions, setSessionPending],
  );

  useEffect(() => {
    if (!sessionDetail || !selectedSessionId || sessionDetail.id !== selectedSessionId) return;
    if (pendingSessionsRef.current[sessionDetail.id]) return;

    pendingInputsRef.current = uniquePendingInputs(sessionDetail.pendingUserInputs);
    const next = buildAgentUiStateFromSessionDetail(
      sessionDetail,
      sessionStatesRef.current[sessionDetail.id],
    );
    setSessionState(sessionDetail.id, next);

    if (
      !sessionReportIds[sessionDetail.id] &&
      !reportHydratedSessionsRef.current.has(sessionDetail.id)
    ) {
      reportHydratedSessionsRef.current.add(sessionDetail.id);
      const artifactId = inferLatestReportArtifactId(sessionDetail);
      if (artifactId) {
        void client
          .getReportForArtifact(artifactId)
          .then((bundle) => {
            const reportId = bundle.report.reportId;
            setSessionReportIds((current) => ({
              ...current,
              [sessionDetail.id]: reportId,
            }));
            void saveSessionReportId(sessionDetail.id, reportId);
          })
          .catch(() => undefined);
      }
    }

    if (sessionDetail.activeRun) {
      setSessionPending(sessionDetail.id, true);
      void observeRun(sessionDetail.id, sessionDetail.activeRun.runId);
    } else {
      setConnectionState('idle');
    }
  }, [
    observeRun,
    selectedSessionId,
    sessionDetail,
    sessionDetail?.activeRun?.runId,
    sessionDetail?.id,
    sessionReportIds,
    client,
    setSessionPending,
    setSessionState,
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

  const abortAllRunObservers = useCallback(() => {
    Object.values(runControllersRef.current).forEach((controller) => controller.abort());
    runControllersRef.current = {};
  }, []);

  const backgroundPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollPendingRunsSnapshot = useCallback(async () => {
    for (const [sessionId, pending] of Object.entries(pendingSessionsRef.current)) {
      if (!pending) continue;
      const runId = sessionStatesRef.current[sessionId]?.activeRunId;
      if (!runId) continue;
      try {
        const snapshot = await client.getRun(runId);
        applyRunSnapshot(sessionId, snapshot);
      } catch {
        // 后台轮询失败保留上次投影，foreground 再续 SSE。
      }
    }
  }, [applyRunSnapshot, client]);

  const startBackgroundRunPolling = useCallback(() => {
    if (backgroundPollTimerRef.current) return;
    backgroundPollTimerRef.current = setInterval(() => {
      void pollPendingRunsSnapshot();
    }, BACKGROUND_RUN_SNAPSHOT_POLL_MS);
  }, [pollPendingRunsSnapshot]);

  const stopBackgroundRunPolling = useCallback(() => {
    if (!backgroundPollTimerRef.current) return;
    clearInterval(backgroundPollTimerRef.current);
    backgroundPollTimerRef.current = null;
  }, []);

  const resumeActiveRunObserver = useCallback(() => {
    const sessionId = selectedSessionIdRef.current;
    if (!sessionId) return;
    const state = sessionStatesRef.current[sessionId];
    const runId = state?.activeRunId ?? sessionDetail?.activeRun?.runId;
    if (!runId || !pendingSessionsRef.current[sessionId]) return;
    void observeRun(sessionId, runId, '', false);
  }, [observeRun, sessionDetail?.activeRun?.runId]);

  useAppStateRunLifecycle({
    onBackground: () => {
      abortAllRunObservers();
      void pollPendingRunsSnapshot();
      startBackgroundRunPolling();
    },
    onForeground: () => {
      stopBackgroundRunPolling();
      resumeActiveRunObserver();
    },
  });

  useEffect(() => () => stopBackgroundRunPolling(), [stopBackgroundRunPolling]);

  const submitRun = useCallback(
    async (payload: ComposerSubmitPayload) => {
      const task = payload.content.trim();
      const modelId = payload.modelId || defaultModelId;
      if (!task || !modelId) return;

      let sessionId = selectedSessionIdRef.current;
      if (!sessionId) {
        try {
          const created = await createSession(task.slice(0, 80));
          sessionId = created?.id ?? null;
        } catch (error) {
          if (error instanceof ApiProblem && error.problem.code === 'AUTH_REQUIRED') {
            Alert.alert('需要登录', '请先登录后再发送消息。', [
              { text: '取消', style: 'cancel' },
              { text: '去登录', onPress: () => router.push('/settings/login') },
            ]);
          }
          return;
        }
        if (!sessionId) return;
        ensureSessionSelected(sessionId);
      }

      const runtimeActive = Boolean(
        pendingSessionsRef.current[sessionId] ||
          sessionStatesRef.current[sessionId]?.activeRunId,
      );
      if (runtimeActive) {
        try {
          const result = (await client.submitPendingInput(sessionId, task)) as {
            input?: PendingUserInputView;
          };
          if (result.input) {
            pendingInputsRef.current = uniquePendingInputs([
              ...pendingInputsRef.current,
              result.input,
            ]);
            if (result.input.kind === 'steer' && result.input.status === 'pending') {
              try {
                const promoted = (await client.promotePendingInput(result.input.id)) as PendingUserInputView;
                pendingInputsRef.current = uniquePendingInputs(
                  pendingInputsRef.current.map((item) =>
                    item.id === promoted.id ? promoted : item,
                  ),
                );
              } catch {
                // promote 失败时仍保留 pending 队列项。
              }
            }
            syncSelectedRunUi();
          }
        } catch (error) {
          applyComposerBlockFromError(sessionId, error);
          // 队列失败时保留 Composer 草稿，由用户重试。
        }
        return;
      }

      const localUserId = createClientId();
      const localAssistantId = createClientId();
      const optimisticUser: ConversationItem = {
        id: localUserId,
        kind: 'user',
        content: task,
        createdAt: new Date().toISOString(),
        attachments: payload.optimisticAttachments?.length
          ? payload.optimisticAttachments
          : undefined,
        skillNames: payload.skillNames,
      };
      const optimisticAssistant: ConversationItem = {
        id: localAssistantId,
        kind: 'assistant',
        blocks: [],
        pending: true,
        deliveryStatus: 'streaming',
      };

      const base = sessionStatesRef.current[sessionId] ?? {
        label: task.slice(0, 80),
        subtitle: '',
        conversation: [],
      };
      setSessionState(sessionId, {
        ...base,
        conversation: [...base.conversation, optimisticUser, optimisticAssistant],
      });
      setSessionPending(sessionId, true);
      setConnectionState('connecting');

      const sessionRevision = sessionStatesRef.current[sessionId]?.revisionContext;
      const artifactVersionContext =
        payload.artifactVersionContext ??
        (sessionRevision
          ? { ...sessionRevision, changeSummary: task.slice(0, 500) }
          : undefined);

      try {
        const run = await client.createRun(
          sessionId,
          task,
          modelId,
          payload.reasoningEffort,
          payload.attachmentIds ?? [],
          artifactVersionContext,
          payload.skillNames ?? [],
        );
        const current = sessionStatesRef.current[sessionId];
        if (current) {
          setSessionState(sessionId, {
            ...current,
            revisionContext: undefined,
            activeRunId: run.runId,
            conversation: current.conversation.map((item) => {
              if (item.id === localUserId) return { ...item, id: run.userMessageId };
              if (item.id === localAssistantId) {
                return { ...item, id: run.assistantMessageId, runId: run.runId };
              }
              return item;
            }),
          });
        }
        await observeRun(sessionId, run.runId, task, true);
        await refreshSessions();
        setComposerRevisionSeed(null);
      } catch (error) {
        const blockDetail = applyComposerBlockFromError(sessionId, error);
        setSessionPending(sessionId, false);
        setConnectionState('offline');
        const failureText = blockDetail ?? '本次回答未完成，请稍后重试。';
        const current = sessionStatesRef.current[sessionId];
        if (current) {
          setSessionState(sessionId, {
            ...current,
            conversation: current.conversation.map((item) =>
              item.kind === 'assistant' && item.id === localAssistantId
                ? {
                    ...item,
                    pending: false,
                    deliveryStatus: 'failed',
                    blocks: [
                      {
                        id: `${localAssistantId}-failed`,
                        type: 'text',
                        content: failureText,
                      },
                    ],
                  }
                : item,
            ),
          });
        }
      }
    },
    [
      applyComposerBlockFromError,
      client,
      createSession,
      defaultModelId,
      ensureSessionSelected,
      observeRun,
      refreshSessions,
      setSessionPending,
      setSessionState,
      syncSelectedRunUi,
    ],
  );

  const beginArtifactRevision = useCallback(
    (artifact: ArtifactRef) => {
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId || !artifact.seriesId || artifact.versionNumber === undefined) return;
      const series = sessionStatesRef.current[sessionId]?.workbench?.artifactSeries?.find(
        (item) => item.seriesId === artifact.seriesId,
      );
      const expectedCurrentArtifactId = series?.currentArtifactId;
      if (!expectedCurrentArtifactId) return;
      const current = sessionStatesRef.current[sessionId];
      if (!current) return;
      setSessionState(sessionId, {
        ...current,
        revisionContext: {
          seriesId: artifact.seriesId,
          baseArtifactId: artifact.artifactId,
          expectedCurrentArtifactId,
        },
      });
      setComposerRevisionSeed(
        `请基于 ${artifact.logicalName ?? artifact.fileName} v${artifact.versionNumber} 修改：`,
      );
    },
    [setSessionState],
  );

  const sendFollowUp = useCallback(
    async (inputId: string) => {
      const sessionId = selectedSessionIdRef.current;
      const input = pendingInputsRef.current.find((item) => item.id === inputId);
      if (!sessionId || !input) return;
      setFollowUpSubmittingId(inputId);
      try {
        const run = await client.sendPendingInput(inputId);
        pendingInputsRef.current = pendingInputsRef.current.filter((item) => item.id !== inputId);
        const current = sessionStatesRef.current[sessionId];
        if (current && !current.conversation.some((item) => item.id === run.userMessageId)) {
          setSessionState(sessionId, {
            ...current,
            activeRunId: run.runId,
            conversation: [
              ...current.conversation,
              {
                id: run.userMessageId,
                kind: 'user',
                content: input.content,
                createdAt: new Date().toISOString(),
              },
            ],
          });
        }
        setSessionPending(sessionId, true);
        setConnectionState('connecting');
        await observeRun(sessionId, run.runId, input.content, true);
        await refreshSessions();
        syncSelectedRunUi();
      } catch {
        // 发送失败时保留队列项。
      } finally {
        setFollowUpSubmittingId(null);
      }
    },
    [syncSelectedRunUi, client, observeRun, refreshSessions, setSessionPending, setSessionState],
  );

  const cancelFollowUp = useCallback(
    async (inputId: string) => {
      try {
        const updated = (await client.cancelPendingInput(inputId)) as PendingUserInputView;
        pendingInputsRef.current = uniquePendingInputs(
          pendingInputsRef.current.map((item) => (item.id === inputId ? updated : item)),
        );
        syncSelectedRunUi();
      } catch {
        // 取消失败时忽略。
      }
    },
    [syncSelectedRunUi, client],
  );

  const respondClarification = useCallback(
    async (interruptId: string, answer: string) => {
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId) return;
      const runId = sessionStatesRef.current[sessionId]?.activeRunId;
      if (!runId) return;
      setHitlSubmitting(true);
      try {
        const result = await client.controlRun(runId, {
          type: 'respond',
          interruptId,
          payload: { answer: answer.trim() },
        });
        applyRunSnapshot(sessionId, result.snapshot);
        if (result.snapshot.status === 'running' || result.snapshot.status === 'queued') {
          void observeRun(sessionId, runId, '', true);
        }
      } catch {
        try {
          applyRunSnapshot(sessionId, await client.getRun(runId));
        } catch {
          // keep prior projection
        }
      } finally {
        setHitlSubmitting(false);
      }
    },
    [applyRunSnapshot, client, observeRun],
  );

  const respondToolApproval = useCallback(
    async (interruptId: string, approve: boolean) => {
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId) return;
      const state = sessionStatesRef.current[sessionId];
      const runId = state?.activeRunId;
      const interrupt = state?.activeInterrupt;
      if (!runId || interrupt?.kind !== 'tool_approval' || interrupt.interruptId !== interruptId) {
        return;
      }
      const decisions: ToolApprovalDecision[] = interrupt.payload.items.map((item) => ({
        itemId: item.itemId,
        toolCallId: item.toolCallId,
        argumentsHash: item.argumentsHash,
        decision: approve ? 'approve' : 'reject',
      }));
      setHitlSubmitting(true);
      try {
        const result = await client.controlRun(runId, {
          type: approve ? 'approve' : 'reject',
          interruptId,
          decisions,
        });
        applyRunSnapshot(sessionId, result.snapshot);
        if (result.snapshot.status === 'running' || result.snapshot.status === 'queued') {
          void observeRun(sessionId, runId, '', true);
        }
      } catch {
        try {
          applyRunSnapshot(sessionId, await client.getRun(runId));
        } catch {
          // keep prior projection
        }
      } finally {
        setHitlSubmitting(false);
      }
    },
    [applyRunSnapshot, client, observeRun],
  );

  const controlActiveRun = useCallback(
    async (command: { type: 'pause' } | { type: 'resume' }) => {
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId) return;
      const runId =
        sessionStatesRef.current[sessionId]?.activeRunId ?? sessionDetail?.activeRun?.runId;
      if (!runId) return;
      try {
        const result = await client.controlRun(runId, command);
        applyRunSnapshot(sessionId, result.snapshot);
        if (result.snapshot.status === 'running' || result.snapshot.status === 'queued') {
          void observeRun(sessionId, runId, '', true);
        }
      } catch {
        try {
          applyRunSnapshot(sessionId, await client.getRun(runId));
        } catch {
          // keep prior projection
        }
      }
    },
    [applyRunSnapshot, client, observeRun, sessionDetail?.activeRun?.runId],
  );

  const pauseActiveRun = useCallback(
    () => controlActiveRun({ type: 'pause' }),
    [controlActiveRun],
  );

  const resumeActiveRun = useCallback(
    () => controlActiveRun({ type: 'resume' }),
    [controlActiveRun],
  );

  const restoreArtifactVersion = useCallback(
    async (artifact: ArtifactRef) => {
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId || !artifact.seriesId) return;
      const expectedCurrentArtifactId = sessionStatesRef.current[
        sessionId
      ]?.workbench?.artifactSeries?.find((series) => series.seriesId === artifact.seriesId)
        ?.currentArtifactId;
      if (!expectedCurrentArtifactId) return;
      try {
        await client.restoreArtifact(artifact.artifactId, expectedCurrentArtifactId);
        await refreshSessions();
        await reloadSessionDetail(sessionId);
      } catch {
        // 恢复失败时保留当前投影。
      }
    },
    [client, refreshSessions, reloadSessionDetail],
  );

  const cancelActiveRun = useCallback(async () => {
    const sessionId = selectedSessionIdRef.current;
    if (!sessionId) return;
    const state = sessionStatesRef.current[sessionId];
    const runId = state?.activeRunId ?? sessionDetail?.activeRun?.runId;
    if (!runId) return;
    try {
      await client.cancelRun(runId);
    } catch {
      // 取消请求失败时仍依赖 SSE 终态。
    }
  }, [client, sessionDetail?.activeRun?.runId]);

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
    respondClarification,
    respondToolApproval,
    submitRun,
    sendFollowUp,
    cancelFollowUp,
    beginArtifactRevision,
    restoreArtifactVersion,
    pauseActiveRun,
    resumeActiveRun,
    cancelActiveRun,
    activeRunId: workbenchSnapshot.activeRunId,
  };
}
