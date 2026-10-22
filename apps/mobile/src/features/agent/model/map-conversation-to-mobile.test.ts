import { describe, expect, it } from 'vitest';
import type { ConversationItem } from '@harness/agent-ui-types';

import { mapConversationToMobile } from './map-conversation-to-mobile';

describe('mapConversationToMobile', () => {
  it('preserves user then assistant tool_activity order', () => {
    const items: ConversationItem[] = [
      { id: 'u1', kind: 'user', content: 'hello' },
      {
        id: 'a1',
        kind: 'assistant',
        deliveryStatus: 'completed',
        blocks: [
          { id: 't1', type: 'text', content: 'intro', phase: 'process', roundSequence: 1, roundId: 'r1', blockSequence: 0 },
          {
            id: 'tool1',
            type: 'tool_activity',
            toolCallId: 'tc1',
            toolName: 'web_search',
            status: 'completed',
            title: 'web_search',
            summary: 'query',
            startedAt: '2026-10-21T00:00:00.000Z',
            roundSequence: 1,
            roundId: 'r1',
            blockSequence: 1,
          },
          { id: 't2', type: 'text', content: 'answer', phase: 'final', roundSequence: 1, roundId: 'r1', blockSequence: 2 },
        ],
      },
    ];

    const mapped = mapConversationToMobile(items);
    expect(mapped).toHaveLength(2);
    expect(mapped[1]?.kind).toBe('assistant');
    if (mapped[1]?.kind !== 'assistant') return;
    const types = mapped[1].blocks.map((block) => block.type);
    expect(types).toEqual(['text', 'tool_activity', 'text']);
  });
});
