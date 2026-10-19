import { describe, expect, it } from 'vitest';
import {
  sortPendingToolResultsByCallOrder,
  type PendingToolResult,
} from '../../../src/agent-runtime/pending-tool-result';

describe('sortPendingToolResultsByCallOrder', () => {
  it('orders pending results by model declaration order', () => {
    const pending: PendingToolResult[] = [
      {
        candidate: { toolCallId: 'b', toolName: 'b', content: '{}' },
        enterFinalAnswer: false,
        summary: { toolCallId: 'b', toolName: 'b', status: 'succeeded' },
      },
      {
        candidate: { toolCallId: 'a', toolName: 'a', content: '{}' },
        enterFinalAnswer: false,
        summary: { toolCallId: 'a', toolName: 'a', status: 'succeeded' },
      },
    ];
    sortPendingToolResultsByCallOrder(pending, [
      { id: 'a', name: 'a', arguments: '{}', blockSequence: 0, providerIndex: 0 },
      { id: 'b', name: 'b', arguments: '{}', blockSequence: 1, providerIndex: 1 },
    ]);
    expect(pending.map((item) => item.candidate.toolCallId)).toEqual(['a', 'b']);
  });
});
