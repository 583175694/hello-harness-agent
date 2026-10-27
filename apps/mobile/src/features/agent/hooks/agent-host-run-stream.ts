import { observeRunConnection } from '@harness/agent-conversation';
import type { AgentClient, ToolStreamEvent } from '@harness/agent-client';
import type { RunSnapshot, RunStreamEvent } from '@harness/agent-protocol';
import type { AgentUiState } from '@harness/agent-ui-types';
import type { Dispatch, SetStateAction } from 'react';

import type { ConnectionState } from '../components/connection-pill';
import { mobileRunReducerDeps } from '../model/mobile-run-reducer-deps';
import { applyRunEventToSession, applyRunSnapshotToSession } from '@harness/agent-run-state';
import { saveSessionReportId } from '@/lib/storage';
import { BACKGROUND_RUN_SNAPSHOT_POLL_MS } from '../config/run-lifecycle.constants';
import type { RunHostSessionStore } from './agent-host-run-session-store';

export type RunStreamDeps = {
  client: AgentClient;
  store: RunHostSessionStore;
  refreshSessions: () => Promise<void>;
  setConnectionState: Dispatch<SetStateAction<ConnectionState>>;
  setReconnectRunId: Dispatch<SetStateAction<string | null>>;
  reconnectRunId: string | null;
  selectedSessionId: string | null;
  sessionDetailActiveRunId?: string | null;
  maybeNotifyRunAttention: (
    sessionId: string,
    kind: 'completed' | 'failed' | 'clarification' | 'tool_approval',
    detail?: string,
  ) => void;
  maybeNotifyPendingInterrupt: (sessionId: string, state: AgentUiState) => void;
  setSessionPending: (sessionId: string, pending: boolean) => void;
  setSessionState: (sessionId: string, next: AgentUiState) => void;
  setSessionReportIds: Dispatch<SetStateAction<Record<string, string>>>;
};

export function createRunStreamHandlers(deps: RunStreamDeps) {
  const { client, store } = deps;
  const backgroundPollTimerRef: { current: ReturnType<typeof setInterval> | null } = {
    current: null,
  };

  const applyRunSnapshot = (sessionId: string, snapshot: RunSnapshot) => {
    const target = store.sessionStatesRef.current[sessionId];
    if (!target) return;
    const cursor = store.runSequencesRef.current[snapshot.runId] ?? 0;
    const result = applyRunSnapshotToSession(
      sessionId,
      target,
      snapshot,
      store.pendingInputsRef.current,
      cursor,
      mobileRunReducerDeps,
    );
    if (result.skipped) return;
    store.runSequencesRef.current[snapshot.runId] = result.nextCursor;
    store.pendingInputsRef.current = result.pendingInputs;
    deps.setSessionPending(sessionId, result.sessionPending);
    deps.setSessionState(sessionId, result.sessionState);
    deps.setConnectionState('live');
    deps.maybeNotifyPendingInterrupt(sessionId, result.sessionState);
  };

  const applyRunEvent = (sessionId: string, event: RunStreamEvent, task = '') => {
    if (event.type === 'run.snapshot') {
      applyRunSnapshot(sessionId, event.payload as RunSnapshot);
      return;
    }
    const target = store.sessionStatesRef.current[sessionId];
    if (!target) throw new Error('RUN_EVENT_TARGET_MISSING');
    const cursor = store.runSequencesRef.current[event.runId] ?? 0;
    const result = applyRunEventToSession(
      sessionId,
      target,
      store.pendingInputsRef.current,
      store.pendingSessionsRef.current[sessionId] ?? false,
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
        deps.setSessionReportIds((current) => ({
          ...current,
          [sessionId]: reportId,
        }));
        void saveSessionReportId(sessionId, reportId);
      }
    }
    store.runSequencesRef.current[event.runId] = result.nextCursor;
    store.pendingInputsRef.current = result.pendingInputs;
    deps.setSessionPending(sessionId, result.sessionPending);
    deps.setSessionState(sessionId, result.sessionState);
    deps.setConnectionState('live');
    deps.maybeNotifyPendingInterrupt(sessionId, result.sessionState);
  };

  const observeRun = async (
    sessionId: string,
    runId: string,
    task = '',
    skipInitialSnapshot = false,
  ): Promise<void> => {
    if (store.runControllersRef.current[runId]) return;
    const controller = new AbortController();
    store.runControllersRef.current[runId] = controller;
    deps.setReconnectRunId((current) => (current === runId ? null : current));
    deps.setConnectionState('connecting');
    let terminalObserved = false;
    try {
      const outcome = await observeRunConnection(
        sessionId,
        runId,
        {
          getRun: (activeRunId, signal) => client.getRun(activeRunId, signal),
          subscribeRun: (activeRunId, cursor, onEvent, signal) =>
            client.subscribeRun(activeRunId, cursor, onEvent, signal),
          getCursor: (activeRunId) => store.runSequencesRef.current[activeRunId],
          applySnapshot: applyRunSnapshot,
          applyEvent: applyRunEvent,
        },
        { task, skipInitialSnapshot, signal: controller.signal },
      );
      terminalObserved = outcome.terminalObserved;
      if (terminalObserved) {
        deps.setConnectionState('idle');
      } else if (!controller.signal.aborted) {
        deps.setConnectionState('reconnecting');
        deps.setReconnectRunId(runId);
      }
    } catch {
      if (!controller.signal.aborted) {
        deps.setConnectionState('offline');
        deps.setReconnectRunId(runId);
      }
    } finally {
      delete store.runControllersRef.current[runId];
      if (!controller.signal.aborted) {
        try {
          if (terminalObserved) {
            deps.setReconnectRunId(null);
            deps.setSessionPending(sessionId, false);
            const state = store.sessionStatesRef.current[sessionId];
            const lastAssistant = state?.conversation
              .filter((item) => item.kind === 'assistant')
              .at(-1);
            const status =
              lastAssistant?.kind === 'assistant' ? lastAssistant.deliveryStatus : undefined;
            if (status === 'completed') {
              deps.maybeNotifyRunAttention(sessionId, 'completed');
            } else if (status === 'failed' || status === 'cancelled') {
              deps.maybeNotifyRunAttention(
                sessionId,
                'failed',
                lastAssistant?.kind === 'assistant' ? lastAssistant.error?.detail : undefined,
              );
            }
            await deps.refreshSessions();
          } else {
            const snapshot = await client.getRun(runId);
            applyRunSnapshot(sessionId, snapshot);
          }
        } catch {
          // Run 已持久化；刷新失败保留当前投影。
        }
      }
    }
  };

  const hydrateLatestRunSnapshot = async (sessionId: string, runId: string) => {
    try {
      const snapshot = await client.getRun(runId);
      if (store.sessionStatesRef.current[sessionId]) {
        applyRunSnapshot(sessionId, snapshot);
      }
    } catch {
      // 详情 hydrate 失败时保留 session 投影。
    }
  };

  const abortAllRunObservers = () => {
    Object.values(store.runControllersRef.current).forEach((controller) => controller.abort());
    store.runControllersRef.current = {};
  };

  const pollPendingRunsSnapshot = async () => {
    for (const [sessionId, pending] of Object.entries(store.pendingSessionsRef.current)) {
      if (!pending) continue;
      const runId = store.sessionStatesRef.current[sessionId]?.activeRunId;
      if (!runId) continue;
      try {
        const snapshot = await client.getRun(runId);
        applyRunSnapshot(sessionId, snapshot);
      } catch {
        // 后台轮询失败保留上次投影。
      }
    }
  };

  const startBackgroundRunPolling = () => {
    if (backgroundPollTimerRef.current) return;
    backgroundPollTimerRef.current = setInterval(() => {
      void pollPendingRunsSnapshot();
    }, BACKGROUND_RUN_SNAPSHOT_POLL_MS);
  };

  const stopBackgroundRunPolling = () => {
    if (!backgroundPollTimerRef.current) return;
    clearInterval(backgroundPollTimerRef.current);
    backgroundPollTimerRef.current = null;
  };

  const resumeActiveRunObserver = () => {
    const sessionId = store.selectedSessionIdRef.current;
    if (!sessionId) return;
    const state = store.sessionStatesRef.current[sessionId];
    const runId = state?.activeRunId ?? deps.sessionDetailActiveRunId;
    if (!runId || !store.pendingSessionsRef.current[sessionId]) return;
    void observeRun(sessionId, runId, '', false);
  };

  return {
    applyRunSnapshot,
    applyRunEvent,
    observeRun,
    hydrateLatestRunSnapshot,
    abortAllRunObservers,
    pollPendingRunsSnapshot,
    startBackgroundRunPolling,
    stopBackgroundRunPolling,
    resumeActiveRunObserver,
    backgroundPollTimerRef,
  };
}
