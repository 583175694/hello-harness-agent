import { describe, expect, it } from 'vitest';

import { ConversationBlockCollector } from '../../../src/projection/conversation-block.collector';

describe('ConversationBlockCollector reasoning projection', () => {
  it('merges all reasoning deltas at the same round position into one canonical block', () => {
    const collector = new ConversationBlockCollector('assistant-1');
    const event = {
      type: 'reasoning.delta' as const,
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    };

    const firstId = collector.appendReasoning({ ...event, delta: 'first ' });
    const secondId = collector.appendReasoning({ ...event, delta: 'second' });

    expect(secondId).toBe(firstId);
    expect(collector.snapshot()).toEqual([
      {
        id: 'assistant-1-reasoning-1',
        type: 'reasoning',
        content: 'first second',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
      },
    ]);
  });
});
