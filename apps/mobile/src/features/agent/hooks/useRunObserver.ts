import type { RunSnapshot, RunStreamEvent } from '@harness/agent-protocol';
import { useCallback, useRef } from 'react';

import type { AgentClient } from '@harness/agent-client';

export type RunObserverCallbacks = {
  applySnapshot: (snapshot: RunSnapshot) => void;
  applyEvent: (event: RunStreamEvent, task: string) => void;
  onReconnecting: (runId: string) => void;
  onReconnected: () => void;
  onError: (message: string) => void;
  refreshSessions: () => Promise<void>;
  syncAfterTerminal: (sessionId: string) => Promise<void>;
};

const BACKOFF_MS = [0, 1_000, 2_000, 4_000, 8_000] as const;

export function useRunObserver(client: AgentClient) {
  const controllersRef = useRef<Record<string, AbortController>>({});
  const sequencesRef = useRef<Record<string, number>>({});

  const getCursor = useCallback((runId: string) => sequencesRef.current[runId] ?? 0, []);

  const setCursor = useCallback((runId: string, seq: number) => {
    sequencesRef.current[runId] = seq;
  }, []);

  const abortRun = useCallback((runId: string) => {
    controllersRef.current[runId]?.abort();
    delete controllersRef.current[runId];
  }, []);

  const abortAll = useCallback(() => {
    Object.values(controllersRef.current).forEach((c) => c.abort());
    controllersRef.current = {};
  }, []);

  const observeRun = useCallback(
    async (
      sessionId: string,
      runId: string,
      callbacks: RunObserverCallbacks,
      task = '',
      skipInitialSnapshot = false,
    ): Promise<void> => {
      if (controllersRef.current[runId]) return;
      const controller = new AbortController();
      controllersRef.current[runId] = controller;
      callbacks.onReconnected();
      let terminalObserved = false;
      try {
        for (const [attempt, delay] of BACKOFF_MS.entries()) {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          if (controller.signal.aborted) return;
          if (!(skipInitialSnapshot && attempt === 0)) {
            const snapshot = await client.getRun(runId, controller.signal);
            if (snapshot.lastEventSequence >= getCursor(runId)) {
              setCursor(runId, snapshot.lastEventSequence);
              callbacks.applySnapshot(snapshot);
            }
            if (['completed', 'failed', 'cancelled'].includes(snapshot.status)) {
              terminalObserved = true;
              return;
            }
          }
          try {
            await client.subscribeRun(
              runId,
              getCursor(runId),
              (event) => {
                callbacks.applyEvent(event, task);
                terminalObserved =
                  event.type === 'run.completed' ||
                  event.type === 'run.failed' ||
                  event.type === 'run.cancelled' ||
                  (event.type === 'run.snapshot' &&
                    'status' in event.payload &&
                    ['completed', 'failed', 'cancelled'].includes(
                      (event.payload as RunSnapshot).status,
                    ));
              },
              controller.signal,
            );
            if (terminalObserved) return;
          } catch {
            if (controller.signal.aborted) return;
            if (delay === 8_000) throw new Error('SSE 连接失败');
            continue;
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          callbacks.onReconnecting(runId);
          callbacks.onError(error instanceof Error ? error.message : '连接中断');
        }
      } finally {
        delete controllersRef.current[runId];
        if (!controller.signal.aborted) {
          try {
            if (terminalObserved) {
              await callbacks.syncAfterTerminal(sessionId);
            } else {
              const snapshot = await client.getRun(runId);
              callbacks.applySnapshot(snapshot);
            }
            await callbacks.refreshSessions();
          } catch {
            // keep projection
          }
        }
      }
    },
    [client, getCursor, setCursor],
  );

  return { observeRun, abortRun, abortAll, getCursor, setCursor, sequencesRef };
}
