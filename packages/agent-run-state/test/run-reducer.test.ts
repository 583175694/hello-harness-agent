import { describe, expect, it, vi } from 'vitest';
import type { RunReducerDeps } from '../src/run-reducer-deps.js';
import { applyRunEventToSession } from '../src/apply-run-event.js';
import { applyRunSnapshotToSession } from '../src/apply-run-snapshot.js';
import type { AgentUiState } from '@harness/agent-ui-types';

const emptyDeps = (): RunReducerDeps => ({
  toConversationItem: vi.fn(() => ({ id: 'a1', kind: 'assistant', blocks: [] })),
  preferRicherAssistant: (_c, restored) => restored,
  mergePendingSteerState: (c) => c,
  uniquePendingInputs: (items) => items,
  mergeWorkbenchDeliverables: (wb) => wb,
  applyToolEvent: vi.fn(),
  resolveWorkbenchOpenOnToolEvent: () => true,
  collectedArtifactFromCommandResult: () => undefined,
  canonicalUrl: (url) => url,
});

const baseState = (): AgentUiState => ({
  label: 'Test',
  subtitle: '',
  conversation: [{ id: 'a1', kind: 'assistant', blocks: [], pending: true }],
});

describe('applyRunEventToSession', () => {
  it('ignores duplicate seq', () => {
    const result = applyRunEventToSession(
      's1',
      baseState(),
      [],
      true,
      { type: 'message.delta', runId: 'r1', seq: 3, payload: { type: 'message.delta', messageId: 'a1', delta: 'x', roundId: 'r', roundSequence: 1, blockSequence: 1, phase: null } } as never,
      5,
      '',
      emptyDeps(),
    );
    expect(result.duplicate).toBe(true);
    expect(result.nextCursor).toBe(5);
  });

  it('returns gap when seq is not consecutive', () => {
    const result = applyRunEventToSession(
      's1',
      baseState(),
      [],
      true,
      { type: 'message.delta', runId: 'r1', seq: 5, payload: { type: 'message.delta', messageId: 'a1', delta: 'x', roundId: 'r', roundSequence: 1, blockSequence: 1, phase: null } } as never,
      3,
      '',
      emptyDeps(),
    );
    expect(result.gap).toBe(true);
  });
});

describe('applyRunSnapshotToSession', () => {
  it('skips stale snapshot cursor', () => {
    const result = applyRunSnapshotToSession(
      's1',
      baseState(),
      {
        runId: 'r1',
        assistantMessageId: 'a1',
        assistantContent: '',
        status: 'running',
        lastEventSequence: 2,
        createdAt: new Date().toISOString(),
        blocks: [],
        toolCallCount: 0,
        executions: [],
        sources: [],
      } as never,
      [],
      5,
      emptyDeps(),
    );
    expect(result.skipped).toBe(true);
  });
});
