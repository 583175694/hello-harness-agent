import { describe, expect, it } from 'vitest';

import { chatStreamEventSchema } from '../src/index.js';

describe('memory_write stream events', () => {
  it('accepts started and completed payloads', () => {
    expect(
      chatStreamEventSchema.parse({
        type: 'tool.started',
        messageId: 'msg-1',
        blockId: 'block-1',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
        toolCallId: 'call-1',
        toolName: 'memory_write',
        title: '写入记忆',
        input: { action: 'create', title: '称呼', content: '用户希望被叫做小柯' },
        startedAt: '2026-10-16T01:00:00.000Z',
      }),
    ).toMatchObject({ toolName: 'memory_write' });

    expect(
      chatStreamEventSchema.parse({
        type: 'tool.completed',
        messageId: 'msg-1',
        blockId: 'block-1',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
        toolCallId: 'call-1',
        toolName: 'memory_write',
        completedAt: '2026-10-16T01:00:01.000Z',
        durationMs: 120,
        result: {
          ok: true,
          action: 'create',
          memoryId: 'mem-1',
          status: 'active',
          indexingStatus: 'pending',
        },
      }),
    ).toMatchObject({ result: { ok: true, status: 'active' } });
  });
});
