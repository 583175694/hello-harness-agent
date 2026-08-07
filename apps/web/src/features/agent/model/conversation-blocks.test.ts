import type { ChatStreamEvent } from '@harness/agent-protocol';
import { describe, expect, it } from 'vitest';

import { appendTextDelta, applyToolActivityEvent, flattenAssistantText } from './conversation-blocks';

describe('conversation blocks reducer', () => {
  it('preserves text-tool-text order and updates one tool block in place', () => {
    let blocks = appendTextDelta([], {
      type: 'message.delta', messageId: 'message-1', blockId: 'text-1', delta: '先检索。',
    });
    blocks = applyToolActivityEvent(blocks, {
      type: 'tool.started', messageId: 'message-1', blockId: 'tool-1', toolCallId: 'call-1',
      toolName: 'future_tool', title: '读取业务数据', input: { query: '市场数据' },
      startedAt: '2026-08-07T09:00:00.000Z',
    });
    blocks = applyToolActivityEvent(blocks, {
      type: 'tool.completed', messageId: 'message-1', blockId: 'tool-1', toolCallId: 'call-1',
      toolName: 'future_tool', completedAt: '2026-08-07T09:00:01.000Z', durationMs: 1000,
      result: { query: '市场数据', provider: 'serp', results: [] },
    });
    blocks = appendTextDelta(blocks, {
      type: 'message.delta', messageId: 'message-1', blockId: 'text-2', delta: '得到结论。',
    });

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'tool_activity', 'text']);
    expect(blocks[1]).toMatchObject({ id: 'tool-1', title: '读取业务数据', status: 'completed' });
    expect(flattenAssistantText(blocks)).toBe('先检索。得到结论。');
  });

  it('projects tool cancellation separately from failure', () => {
    const started = applyToolActivityEvent([], {
      type: 'tool.started', messageId: 'message-1', blockId: 'tool-1', toolCallId: 'call-1',
      toolName: 'web_search', title: '搜索网页', input: { query: '测试' },
      startedAt: '2026-08-07T09:00:00.000Z',
    });
    const cancelledEvent: Extract<ChatStreamEvent, { type: 'tool.cancelled' }> = {
      type: 'tool.cancelled', messageId: 'message-1', blockId: 'tool-1', toolCallId: 'call-1',
      toolName: 'web_search', completedAt: '2026-08-07T09:00:01.000Z', durationMs: 1000,
      code: 'SEARCH_CANCELLED', detail: '网页搜索已取消。',
    };

    expect(applyToolActivityEvent(started, cancelledEvent)).toEqual([
      expect.objectContaining({ id: 'tool-1', status: 'cancelled', summary: '网页搜索已取消。' }),
    ]);
  });
});
