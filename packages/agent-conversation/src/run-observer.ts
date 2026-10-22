import type { RunSnapshot, RunStreamEvent } from '@harness/agent-protocol';

const RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000] as const;

export type ObserveRunOptions = {
  task?: string;
  skipInitialSnapshot?: boolean;
  signal: AbortSignal;
};

export type ObserveRunHandlers = {
  getRun: (runId: string, signal?: AbortSignal) => Promise<RunSnapshot>;
  subscribeRun: (
    runId: string,
    lastEventId: number | undefined,
    onEvent: (event: RunStreamEvent) => void,
    signal?: AbortSignal,
  ) => Promise<void>;
  getCursor: (runId: string) => number | undefined;
  applySnapshot: (sessionId: string, snapshot: RunSnapshot) => void;
  applyEvent: (sessionId: string, event: RunStreamEvent, task: string) => void;
  sleep?: (ms: number) => Promise<void>;
};

export function isRunTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/** SSE 事件是否表示 Run 已进入终态（与 Web observeRun 判定一致）。 */
export function isTerminalRunStreamEvent(event: RunStreamEvent): boolean {
  if (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  ) {
    return true;
  }
  if (event.type === 'run.snapshot' && 'status' in event.payload) {
    return isRunTerminalStatus(event.payload.status);
  }
  return false;
}

/**
 * Snapshot 对齐 → SSE 订阅 → seq gap 时由 applyEvent 抛错并触发外层重连。
 * 与 apps/web observeRun 核心循环一致；React 终态收尾由调用方 onFinalize 处理。
 */
export async function observeRunConnection(
  sessionId: string,
  runId: string,
  handlers: ObserveRunHandlers,
  options: ObserveRunOptions,
): Promise<{ terminalObserved: boolean }> {
  const task = options.task ?? '';
  const sleep = handlers.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let terminalObserved = false;

  for (const [attempt, delay] of RETRY_DELAYS_MS.entries()) {
    if (delay) await sleep(delay);
    if (options.signal.aborted) return { terminalObserved };

    if (!(options.skipInitialSnapshot && attempt === 0)) {
      const snapshot = await handlers.getRun(runId, options.signal);
      handlers.applySnapshot(sessionId, snapshot);
      if (isRunTerminalStatus(snapshot.status)) {
        return { terminalObserved: true };
      }
    }

    try {
      await handlers.subscribeRun(
        runId,
        handlers.getCursor(runId),
        (event) => {
          handlers.applyEvent(sessionId, event, task);
          if (isTerminalRunStreamEvent(event)) terminalObserved = true;
        },
        options.signal,
      );
      if (terminalObserved) return { terminalObserved: true };
    } catch (requestError) {
      if (options.signal.aborted) return { terminalObserved };
      if (delay === RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]) throw requestError;
    }
  }

  return { terminalObserved };
}
