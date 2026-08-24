import { describe, expect, it } from 'vitest';

import { ConversationBlockCollector } from '../../../src/projection/conversation-block.collector';

describe('ConversationBlockCollector user projection', () => {
  it('keeps text and tool activity in canonical round/block order', () => {
    const collector = new ConversationBlockCollector('assistant-1');
    collector.startTool({
      toolCallId: 'call-1',
      toolName: 'web_search',
      summary: '测试查询',
      startedAt: '2026-08-14T00:00:00.000Z',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 1,
    });
    collector.appendText({
      delta: '先搜索。',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });

    expect(collector.snapshot().map((block) => block.type)).toEqual(['text', 'tool_activity']);
  });

  it('persists a consumed steer as a content block, not an event type', () => {
    const collector = new ConversationBlockCollector('assistant-1');
    collector.appendUserIntervention({
      inputId: 'input-1',
      content: '重点关注科技板块',
      roundId: 'round-2',
      roundSequence: 2,
      blockSequence: 0,
    });

    expect(collector.snapshot()[0]).toMatchObject({
      type: 'user_intervention',
      inputId: 'input-1',
    });
  });
});
