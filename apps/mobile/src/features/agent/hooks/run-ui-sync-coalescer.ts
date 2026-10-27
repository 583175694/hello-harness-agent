import {
  MOBILE_STREAM_CONVERSATION_UI_MS,
} from '../config/run-ui-sync.constants';
import type { RunHostSessionStore } from './agent-host-run-session-store';

export type RunUiSyncMode = 'immediate' | 'coalesced';

export function isSelectedSessionStreaming(store: Pick<
  RunHostSessionStore,
  'selectedSessionIdRef' | 'sessionStatesRef' | 'pendingSessionsRef'
>): boolean {
  const sessionId = store.selectedSessionIdRef.current;
  if (!sessionId) return false;
  if (store.pendingSessionsRef.current[sessionId]) return true;
  const state = store.sessionStatesRef.current[sessionId];
  if (!state) return false;
  if (state.activeRunId) return true;
  const tail = state.conversation.at(-1);
  if (tail?.kind === 'assistant') {
    return tail.deliveryStatus === 'streaming' || tail.pending === true;
  }
  return false;
}

type CoalescerInput = {
  sync: (options?: { forceMeta?: boolean }) => void;
  store: Pick<RunHostSessionStore, 'selectedSessionIdRef' | 'sessionStatesRef' | 'pendingSessionsRef'>;
  streamThrottleMs?: number;
};

export function createRunUiSyncCoalescer(input: CoalescerInput) {
  const streamThrottleMs = input.streamThrottleMs ?? MOBILE_STREAM_CONVERSATION_UI_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let raf: number | null = null;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (raf != null) cancelAnimationFrame(raf);
    raf = null;
  };

  const flush = (options?: { forceMeta?: boolean }) => {
    cancel();
    input.sync(options);
  };

  const schedule = (mode: RunUiSyncMode, options?: { forceMeta?: boolean }) => {
    if (mode === 'immediate') {
      flush(options);
      return;
    }

    if (!isSelectedSessionStreaming(input.store)) {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        input.sync(options);
      });
      return;
    }

    if (timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      input.sync(options);
    }, streamThrottleMs);
  };

  return { schedule, flush, cancel };
}
