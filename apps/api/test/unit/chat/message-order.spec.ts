import { describe, expect, it } from 'vitest';
import { compareMessageOrder } from '../../../src/chat/message-order';

describe('compareMessageOrder', () => {
  it('keeps the user input before the assistant draft when a Run shares one timestamp', () => {
    const createdAt = new Date('2026-08-12T00:00:00.000Z');
    const messages = [
      { id: '000-assistant', role: 'assistant' as const, runId: 'run-1', createdAt },
      { id: 'zzz-user', role: 'user' as const, runId: 'run-1', createdAt },
    ];

    expect(messages.sort(compareMessageOrder).map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
  });

  it('continues to order different Runs by time', () => {
    const messages = [
      {
        id: 'newer',
        role: 'user' as const,
        runId: 'run-2',
        createdAt: new Date('2026-08-12T00:00:01.000Z'),
      },
      {
        id: 'older',
        role: 'assistant' as const,
        runId: 'run-1',
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
      },
    ];

    expect(messages.sort(compareMessageOrder).map((message) => message.id)).toEqual([
      'older',
      'newer',
    ]);
  });
});
