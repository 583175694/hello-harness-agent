import { describe, expect, it } from 'vitest';
import type { ConversationItem } from '@harness/agent-ui-types';

import {
  mapConversationToMobile,
  resetMapConversationToMobileCacheForTests,
} from './map-conversation-to-mobile';

describe('mapConversationToMobile', () => {
  it('reuses cached mobile items when upstream conversation references are unchanged', () => {
    resetMapConversationToMobileCacheForTests();
    const user: ConversationItem = { id: 'u1', kind: 'user', content: 'hello' };
    const assistant: ConversationItem = {
      id: 'a1',
      kind: 'assistant',
      deliveryStatus: 'completed',
      blocks: [{ id: 't1', type: 'text', content: 'done', phase: 'final', roundSequence: 1, roundId: 'r1', blockSequence: 0 }],
    };
    const first = mapConversationToMobile([user, assistant]);
    const second = mapConversationToMobile([user, assistant]);
    expect(first[0]).toBe(second[0]);
    expect(first[1]).toBe(second[1]);
  });

  it('remaps only the streaming assistant row when text grows but block structure is unchanged', () => {
    resetMapConversationToMobileCacheForTests();
    const user: ConversationItem = { id: 'u1', kind: 'user', content: 'hello' };
    const assistantV1: ConversationItem = {
      id: 'a1',
      kind: 'assistant',
      deliveryStatus: 'streaming',
      pending: true,
      blocks: [
        {
          id: 't1',
          type: 'text',
          content: 'hel',
          phase: 'final',
          roundSequence: 1,
          roundId: 'r1',
          blockSequence: 0,
        },
      ],
    };
    const first = mapConversationToMobile([user, assistantV1]);
    const assistantV2: ConversationItem = {
      ...assistantV1,
      blocks: [
        {
          id: 't1',
          type: 'text',
          content: 'hello world',
          phase: 'final',
          roundSequence: 1,
          roundId: 'r1',
          blockSequence: 0,
        },
      ],
    };
    const second = mapConversationToMobile([user, assistantV2]);
    expect(first[0]).toBe(second[0]);
    expect(first[1]).not.toBe(second[1]);
    if (first[1]?.kind === 'assistant' && second[1]?.kind === 'assistant') {
      expect(second[1].finalText).toContain('hello world');
    }
  });

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
