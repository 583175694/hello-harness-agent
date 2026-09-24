import { describe, expect, it } from 'vitest';
import {
  alignCoveredCountToUnitBoundary,
  buildTranscriptUnits,
  flattenUnits,
  isCompleteToolBatch,
  unitBoundaryMessageCount,
} from '../../../src/context-engineering/transcript-units';

describe('transcript-units', () => {
  it('groups assistant tool calls with following tool results into one batch', () => {
    const history = [
      { role: 'user' as const, content: 'hi' },
      {
        role: 'assistant' as const,
        content: null,
        toolCalls: [
          { id: 'a', name: 't', arguments: '{}', blockSequence: 0, providerIndex: 0 },
          { id: 'b', name: 't', arguments: '{}', blockSequence: 1, providerIndex: 1 },
        ],
      },
      { role: 'tool' as const, toolCallId: 'a', content: '1' },
      { role: 'tool' as const, toolCallId: 'b', content: '2' },
      { role: 'user' as const, content: 'next' },
    ];
    const units = buildTranscriptUnits(history);
    expect(units).toHaveLength(3);
    expect(units[1]?.kind).toBe('tool_batch');
    expect(units[1]?.messages).toHaveLength(3);
    expect(isCompleteToolBatch(units[1]!)).toBe(true);
    expect(flattenUnits(units)).toEqual(history);
  });

  it('aligns covered message count to unit start when it falls inside a tool batch', () => {
    const history = [
      { role: 'user' as const, content: 'u1' },
      {
        role: 'assistant' as const,
        content: null,
        toolCalls: [
          { id: 'c1', name: 't', arguments: '{}', blockSequence: 0, providerIndex: 0 },
        ],
      },
      { role: 'tool' as const, toolCallId: 'c1', content: 'r' },
      { role: 'user' as const, content: 'u2' },
    ];
    const units = buildTranscriptUnits(history);
    // message index 2 is the tool result inside the batch (batch starts at index 1)
    expect(alignCoveredCountToUnitBoundary(units, 2)).toBe(1);
    expect(unitBoundaryMessageCount(units, 1)).toBe(1);
    expect(unitBoundaryMessageCount(units, 2)).toBe(3);
  });

  it('marks incomplete tool batches when results are missing', () => {
    const units = buildTranscriptUnits([
      {
        role: 'assistant' as const,
        content: null,
        toolCalls: [
          { id: 'x', name: 't', arguments: '{}', blockSequence: 0, providerIndex: 0 },
        ],
      },
    ]);
    expect(units[0]?.kind).toBe('tool_batch');
    expect(isCompleteToolBatch(units[0]!)).toBe(false);
  });
});
