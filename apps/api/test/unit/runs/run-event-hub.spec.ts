import { describe, expect, it } from 'vitest';
import type { RunSnapshot } from '@harness/agent-protocol';
import { ActiveRunRegistry } from '../../../src/runs/active-run.registry';
import { RunEventHub } from '../../../src/runs/run-event-hub';

function snapshot(): RunSnapshot {
  return {
    runId: 'run-1',
    sessionId: 'session-1',
    status: 'running',
    assistantMessageId: 'assistant-1',
    assistantContent: '',
    blocks: [],
    executions: [],
    sources: [],
    toolCallCount: 0,
    lastEventSequence: 0,
    createdAt: '2026-08-12T00:00:00.000Z',
  };
}

describe('RunEventHub', () => {
  it('assigns increasing sequences and replays only events after the cursor', async () => {
    const registry = new ActiveRunRegistry();
    const hub = new RunEventHub(registry);
    registry.register(snapshot());
    expect(hub.publish('run-1', 'run.started', { status: 'running' })?.seq).toBe(1);
    expect(
      hub.publish('run-1', 'message.delta', {
        type: 'message.delta',
        messageId: 'assistant-1',
        blockId: 'text-1',
        delta: 'hello',
      })?.seq,
    ).toBe(2);
    const iterator = hub.subscribe('run-1', 1)?.[Symbol.asyncIterator]();
    expect((await iterator?.next())?.value).toMatchObject({ seq: 2, type: 'message.delta' });
    await iterator?.return?.();
  });

  it('uses a full snapshot without consuming another subscriber replay', async () => {
    const registry = new ActiveRunRegistry();
    const hub = new RunEventHub(registry);
    registry.register(snapshot());
    hub.publish('run-1', 'run.started', { status: 'running' });
    const snapshotIterator = hub.subscribe('run-1')?.[Symbol.asyncIterator]();
    const replayIterator = hub.subscribe('run-1', 0)?.[Symbol.asyncIterator]();
    expect((await snapshotIterator?.next())?.value).toMatchObject({
      type: 'run.snapshot',
      seq: 1,
    });
    expect((await replayIterator?.next())?.value).toMatchObject({
      type: 'run.started',
      seq: 1,
    });
    await snapshotIterator?.return?.();
    await replayIterator?.return?.();
  });

  it('falls back to a snapshot after cursor eviction', async () => {
    const registry = new ActiveRunRegistry();
    const hub = new RunEventHub(registry);
    registry.register(snapshot());
    for (let index = 0; index < 501; index += 1)
      hub.publish('run-1', 'run.started', { status: 'running' });

    const iterator = hub.subscribe('run-1', 0)?.[Symbol.asyncIterator]();
    expect((await iterator?.next())?.value).toMatchObject({ type: 'run.snapshot', seq: 501 });
    await iterator?.return?.();
  });

  it('closes a terminal subscription after its final snapshot', async () => {
    const registry = new ActiveRunRegistry();
    const hub = new RunEventHub(registry);
    registry.register({ ...snapshot(), status: 'completed' });

    const iterator = hub.subscribe('run-1')?.[Symbol.asyncIterator]();
    expect((await iterator?.next())?.value).toMatchObject({ type: 'run.snapshot' });
    expect((await iterator?.next())?.done).toBe(true);
  });
});
