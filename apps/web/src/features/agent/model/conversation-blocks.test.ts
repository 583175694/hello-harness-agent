import type { ChatStreamEvent } from '@harness/agent-protocol';
import { describe, expect, it } from 'vitest';

import {
  appendTextDelta,
  applyToolActivityEvent,
  cloneAssistantBlocks,
  flattenAssistantText,
} from './conversation-blocks';

describe('conversation blocks reducer', () => {
  it('repairs and reorders an existing text block when its round coordinates arrive later', () => {
    const finalBlock = {
      id: 'text-final',
      type: 'text' as const,
      roundId: 'round-5',
      roundSequence: 5,
      blockSequence: 0,
      content: '最终正文',
    };
    const staleFirstBlock = {
      id: 'text-first',
      type: 'text' as const,
      content: '工具前言',
    };

    const blocks = appendTextDelta([finalBlock, staleFirstBlock], {
      type: 'message.delta',
      messageId: 'message-1',
      blockId: 'text-first',
      delta: '。',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });

    expect(blocks.map((block) => block.id)).toEqual(['text-first', 'text-final']);
    expect(blocks[0]).toMatchObject({
      content: '工具前言。',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });
  });

  it('canonically sorts snapshot blocks before rendering', () => {
    const blocks = cloneAssistantBlocks([
      {
        id: 'final',
        type: 'text',
        content: '最终正文',
        roundId: 'round-5',
        roundSequence: 5,
        blockSequence: 0,
      },
      {
        id: 'preamble',
        type: 'text',
        content: '工具前言',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
      },
    ]);

    expect(blocks.map((block) => block.id)).toEqual(['preamble', 'final']);
  });

  it('filters legacy reasoning blocks from restored snapshots', () => {
    const blocks = cloneAssistantBlocks([
      {
        id: 'reasoning',
        type: 'reasoning',
        content: '内部推理',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
      },
      {
        id: 'answer',
        type: 'text',
        content: '回答',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 1,
      },
    ]);

    expect(blocks).toEqual([expect.objectContaining({ id: 'answer', type: 'text' })]);
  });

  it('preserves text-tool-text order and updates one tool block in place', () => {
    let blocks = appendTextDelta([], {
      type: 'message.delta',
      messageId: 'message-1',
      blockId: 'text-1',
      delta: '先检索。',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });
    blocks = applyToolActivityEvent(blocks, {
      type: 'tool.started',
      messageId: 'message-1',
      blockId: 'tool-1',
      toolCallId: 'call-1',
      toolName: 'web_search',
      title: '读取业务数据',
      input: { query: '市场数据' },
      startedAt: '2026-08-07T09:00:00.000Z',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 1,
    });
    blocks = applyToolActivityEvent(blocks, {
      type: 'tool.completed',
      messageId: 'message-1',
      blockId: 'tool-1',
      toolCallId: 'call-1',
      toolName: 'web_search',
      completedAt: '2026-08-07T09:00:01.000Z',
      durationMs: 1000,
      result: { query: '市场数据', provider: 'serp', results: [] },
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 1,
    });
    blocks = appendTextDelta(blocks, {
      type: 'message.delta',
      messageId: 'message-1',
      blockId: 'text-2',
      delta: '得到结论。',
      roundId: 'round-2',
      roundSequence: 2,
      blockSequence: 0,
    });

    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'tool_activity', 'text']);
    expect(blocks[1]).toMatchObject({ id: 'tool-1', title: '读取业务数据', status: 'completed' });
    expect(flattenAssistantText(blocks)).toBe('先检索。得到结论。');
  });

  it('projects tool cancellation separately from failure', () => {
    const started = applyToolActivityEvent([], {
      type: 'tool.started',
      messageId: 'message-1',
      blockId: 'tool-1',
      toolCallId: 'call-1',
      toolName: 'web_search',
      title: '搜索网页',
      input: { query: '测试' },
      startedAt: '2026-08-07T09:00:00.000Z',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });
    const cancelledEvent: Extract<ChatStreamEvent, { type: 'tool.cancelled' }> = {
      type: 'tool.cancelled',
      messageId: 'message-1',
      blockId: 'tool-1',
      toolCallId: 'call-1',
      toolName: 'web_search',
      completedAt: '2026-08-07T09:00:01.000Z',
      durationMs: 1000,
      code: 'SEARCH_CANCELLED',
      detail: '网页搜索已取消。',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    };

    expect(applyToolActivityEvent(started, cancelledEvent)).toEqual([
      expect.objectContaining({ id: 'tool-1', status: 'cancelled', summary: '网页搜索已取消。' }),
    ]);
  });
});
