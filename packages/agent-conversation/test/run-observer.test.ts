import { describe, expect, it, vi } from 'vitest';
import {
  isRunTerminalStatus,
  isTerminalRunStreamEvent,
  observeRunConnection,
} from '../src/run-observer.js';

describe('isRunTerminalStatus', () => {
  it('recognizes terminal run statuses', () => {
    expect(isRunTerminalStatus('completed')).toBe(true);
    expect(isRunTerminalStatus('running')).toBe(false);
  });
});

describe('observeRunConnection', () => {
  it('returns early when snapshot is terminal', async () => {
    const applySnapshot = vi.fn();
    const subscribeRun = vi.fn();
    const result = await observeRunConnection(
      's1',
      'r1',
      {
        getRun: async () => ({
          runId: 'r1',
          status: 'completed',
          lastEventSequence: 1,
        } as never),
        subscribeRun,
        getCursor: () => undefined,
        applySnapshot,
        applyEvent: vi.fn(),
        sleep: async () => {},
      },
      { signal: new AbortController().signal },
    );
    expect(result.terminalObserved).toBe(true);
    expect(applySnapshot).toHaveBeenCalledOnce();
    expect(subscribeRun).not.toHaveBeenCalled();
  });
});

describe('isTerminalRunStreamEvent', () => {
  it('detects run.completed', () => {
    expect(
      isTerminalRunStreamEvent({
        type: 'run.completed',
        runId: 'r1',
        seq: 1,
        payload: { type: 'run.completed' },
      } as never),
    ).toBe(true);
  });
});
