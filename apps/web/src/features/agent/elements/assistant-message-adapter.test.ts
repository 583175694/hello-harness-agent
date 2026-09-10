import { describe, expect, it } from 'vitest';

import { presentAssistantBlocks } from './assistant-message-adapter';

describe('presentAssistantBlocks', () => {
  it('moves tool-round text and tools into the process and keeps the final round outside', () => {
    const result = presentAssistantBlocks([
      { id: 'preface', type: 'text', content: '先搜索。', roundSequence: 1 },
      {
        id: 'tool',
        type: 'tool_activity',
        toolCallId: 'call',
        toolName: 'web_search',
        status: 'completed',
        title: '搜索网页',
        startedAt: '2026-01-01T00:00:00.000Z',
        roundSequence: 1,
      },
      { id: 'answer', type: 'text', content: '最终答案', roundSequence: 2 },
    ]);

    expect(result.process.map((item) => item.kind)).toEqual(['text', 'tool']);
    expect(result.finalText).toBe('最终答案');
  });

  it('supports legacy blocks without round metadata', () => {
    const result = presentAssistantBlocks([
      { id: 'preface', type: 'text', content: '准备执行。' },
      {
        id: 'tool',
        type: 'tool_activity',
        toolCallId: 'call',
        toolName: 'web_search',
        status: 'completed',
        title: '搜索网页',
        startedAt: '2026-01-01T00:00:00.000Z',
      },
      { id: 'answer', type: 'text', content: '完成。' },
    ]);

    expect(result.process).toHaveLength(2);
    expect(result.finalText).toBe('完成。');
  });
});
