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

  it('waits for clarification and validates the response against the active interrupt', async () => {
    const interruptEvents: Array<{ type: string; status: string }> = [];
    const lifecycle = new RuntimeLifecycleController(
      'run-1',
      undefined,
      [],
      (type, interrupt) => interruptEvents.push({ type, status: interrupt.status }),
    );
    const waiting = lifecycle.createClarification({
      roundId: 'round-1',
      roundSequence: 1,
      finishReason: 'tool_calls',
      outcome: 'final_answer',
      toolCalls: [],
      clarification: {
        question: '选择环境',
        options: ['测试', '生产'],
        allowFreeText: false,
      },
    });
    const interrupt = lifecycle.snapshot().activeInterrupt;
    expect(lifecycle.snapshot().state).toBe('waiting_for_user');
    expect(interrupt).toMatchObject({ kind: 'clarification', status: 'pending' });
    expect(() => lifecycle.respond(interrupt!.interruptId, '其他')).toThrow();
    lifecycle.respond(interrupt!.interruptId, '测试');
    await expect(waiting).resolves.toEqual({ kind: 'clarification', answer: '测试' });
    expect(lifecycle.snapshot().state).toBe('running');
    expect(lifecycle.snapshot().activeInterrupt).toBeUndefined();
    expect(interruptEvents).toEqual([
      { type: 'created', status: 'pending' },
      { type: 'resolved', status: 'resolved' },
    ]);
  });

  it('marks a cancelled pending interrupt as cancelled in the lifecycle event', async () => {
    const events: Array<{ type: string; status: string }> = [];
    const lifecycle = new RuntimeLifecycleController(
      'run-1',
      undefined,
      [],
      (type, interrupt) => events.push({ type, status: interrupt.status }),
    );
    const waiting = lifecycle.createClarification({
      roundId: 'round-1',
      roundSequence: 1,
      finishReason: 'tool_calls',
      outcome: 'final_answer',
      toolCalls: [],
      clarification: { question: '继续吗', options: ['继续'], allowFreeText: false },
    });
    lifecycle.requestCancel();
    await expect(waiting).rejects.toThrow('RUNTIME_CANCELLED');
    expect(events).toEqual([
      { type: 'created', status: 'pending' },
      { type: 'cancelled', status: 'cancelled' },
    ]);
  });

  it('accepts a complete mixed tool approval decision exactly once', async () => {
    const lifecycle = new RuntimeLifecycleController('run-1');
    const waiting = lifecycle.createToolApproval({
      roundId: 'round-1',
      roundSequence: 1,
      items: [
        { itemId: 'one', toolCallId: 'call-1', toolName: 'approval_test', input: { a: 1 }, argumentsHash: 'h1' },
        { itemId: 'two', toolCallId: 'call-2', toolName: 'approval_test', input: { a: 2 }, argumentsHash: 'h2' },
      ],
    });
    const interruptId = lifecycle.snapshot().activeInterrupt!.interruptId;
    const decisions = [
      { itemId: 'one', toolCallId: 'call-1', argumentsHash: 'h1', decision: 'approve' as const },
      { itemId: 'two', toolCallId: 'call-2', argumentsHash: 'h2', decision: 'reject' as const },
    ];
    lifecycle.decideApproval(interruptId, decisions);
    await expect(waiting).resolves.toEqual({ kind: 'tool_approval', decisions });
    expect(() => lifecycle.decideApproval(interruptId, decisions)).toThrow();
  });
});
