import { describe, expect, it, vi } from 'vitest';
import {
  RuntimeLifecycleController,
  type RuntimeLifecycleEvent,
  type RuntimeLifecycleHook,
} from '../../../src/agent-runtime/runtime-lifecycle';

describe('RuntimeLifecycleController', () => {
  it('waits for pause only at transcript-safe boundaries and resumes the same promise', async () => {
    const lifecycle = new RuntimeLifecycleController('run-1');
    lifecycle.requestPause();

    expect(
      lifecycle.reach('model_round_classified', {
        roundId: 'round-1',
        roundSequence: 1,
        finishReason: 'tool_calls',
        outcome: 'tool_calls',
        toolCalls: [],
      }),
    ).toBeUndefined();
    expect(
      lifecycle.reach('tool_dispatch_ready', {
        roundId: 'round-1',
        roundSequence: 1,
        dispatchPlan: [],
      }),
    ).toBeUndefined();
    expect(lifecycle.snapshot().state).toBe('pause_requested');

    let resumed = false;
    const waiting = lifecycle.reach('tool_batch_committed', {
      roundId: 'round-1',
      roundSequence: 1,
      results: [],
      nextAction: 'model_request',
    })!;
    void waiting.then(() => {
      resumed = true;
    });
    expect(lifecycle.snapshot().state).toBe('paused');
    expect(resumed).toBe(false);

    lifecycle.resume();
    await waiting;
    expect(resumed).toBe(true);
    expect(lifecycle.snapshot().state).toBe('running');
  });

  it('keeps the no-op path synchronous without creating a resolved promise', () => {
    const lifecycle = new RuntimeLifecycleController('run-1');
    expect(
      lifecycle.reach('before_model_request', {
        roundSequence: 1,
        finalResponseOnly: false,
      }),
    ).toBeUndefined();
    expect(lifecycle.currentBoundary()).toBe('before_model_request');
  });

  it('runs lifecycle hooks serially and propagates hook failures', async () => {
    const order: string[] = [];
    const first: RuntimeLifecycleHook = {
      onBoundary: vi.fn((event: RuntimeLifecycleEvent) => {
        if (event.boundary !== 'model_round_classified') return;
        return Promise.resolve().then(() => {
          order.push('first');
        });
      }),
    };
    const second: RuntimeLifecycleHook = {
      onBoundary: vi.fn((event: RuntimeLifecycleEvent): Promise<void> | undefined => {
        if (event.boundary !== 'model_round_classified') return;
        order.push('second');
        throw new Error('hook failed');
      }),
    };
    const lifecycle = new RuntimeLifecycleController('run-1', undefined, [first, second]);

    const waiting = lifecycle.reach('model_round_classified', {
      roundId: 'round-1',
      roundSequence: 1,
      finishReason: 'stop',
      outcome: 'final_answer',
      toolCalls: [],
    });
    await expect(waiting).rejects.toThrow('hook failed');
    expect(order).toEqual(['first', 'second']);
  });

  it('rejects pause after entering the final answer phase', () => {
    const lifecycle = new RuntimeLifecycleController('run-1');
    lifecycle.reach('final_answer', {
      roundId: 'round-1',
      roundSequence: 1,
      finishReason: 'stop',
    });
    try {
      lifecycle.requestPause();
      throw new Error('expected pause to be rejected');
    } catch (error) {
      expect((error as { getResponse: () => { code: string } }).getResponse()).toMatchObject({
        code: 'RUN_FINAL_ANSWER_NOT_PAUSABLE',
      });
    }
  });

  it('final answer wins over an unconsumed pause request', () => {
    const lifecycle = new RuntimeLifecycleController('run-1');
    lifecycle.requestPause();
    lifecycle.reach('model_round_classified', {
      roundId: 'round-1',
      roundSequence: 1,
      finishReason: 'stop',
      outcome: 'final_answer',
      toolCalls: [],
    });
    lifecycle.reach('final_answer', {
      roundId: 'round-1',
      roundSequence: 1,
      finishReason: 'stop',
    });
    lifecycle.markTerminal('completed');
    expect(lifecycle.snapshot()).toMatchObject({ state: 'completed', phase: 'terminal' });
  });

  it('cancel releases a paused runtime without resuming it', async () => {
    const lifecycle = new RuntimeLifecycleController('run-1');
    lifecycle.requestPause();
    const waiting = lifecycle.reach('before_model_request', {
      roundSequence: 1,
      finalResponseOnly: false,
    });
    lifecycle.requestCancel();
    await waiting;
    expect(lifecycle.snapshot().state).toBe('cancel_requested');
  });
});
