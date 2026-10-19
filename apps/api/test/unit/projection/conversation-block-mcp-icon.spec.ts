import { describe, expect, it } from 'vitest';

import { ConversationBlockCollector } from '../../../src/projection/conversation-block.collector';

describe('ConversationBlockCollector MCP iconSrc', () => {
  it('persists iconSrc on tool_activity blocks', () => {
    const collector = new ConversationBlockCollector('msg-1');
    collector.startTool({
      toolCallId: 'call-1',
      toolName: 'mcp__demo__ping',
      summary: 'ping',
      startedAt: '2026-01-01T00:00:00.000Z',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
      iconSrc: 'https://example.com/tool.png',
    });
    expect(collector.snapshot()[0]).toMatchObject({
      type: 'tool_activity',
      iconSrc: 'https://example.com/tool.png',
    });
  });
});
