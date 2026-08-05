import { describe, expect, it } from 'vitest';

import {
  chatStreamEventSchema,
  createSessionRequestSchema,
  persistedMessageSchema,
  problemDetailsSchema,
  protocolVersion,
  serviceStatusSchema,
  sessionChatRequestSchema,
  sessionDetailSchema,
  toolCallSchema,
  updateSessionRequestSchema,
} from '../src/index.js';

describe('foundation protocol', () => {
  it('exports a stable protocol version', () => {
    expect(protocolVersion).toBe('0.4.0');
  });

  it('validates service status payloads', () => {
    expect(serviceStatusSchema.parse({ status: 'ok', service: 'api', version: '0.1.0' })).toEqual({
      status: 'ok',
      service: 'api',
      version: '0.1.0',
    });
  });

  it('rejects successful problem responses', () => {
    expect(() =>
      problemDetailsSchema.parse({
        type: 'about:blank',
        title: 'Invalid',
        status: 200,
        code: 'INVALID',
        detail: 'A problem response cannot be successful.',
      }),
    ).toThrow();
  });

  it('validates canonical chat stream events', () => {
    expect(
      chatStreamEventSchema.parse({
        type: 'message.delta',
        messageId: 'msg_1',
        delta: 'hello',
      }),
    ).toMatchObject({ type: 'message.delta', messageId: 'msg_1' });
  });

  it('requires structured function call arguments', () => {
    expect(() =>
      toolCallSchema.parse({ id: 'call_1', name: 'search', arguments: '{"q":"x"}' }),
    ).toThrow();
  });

  it('validates persisted session details without exposing userId', () => {
    const message = persistedMessageSchema.parse({
      id: 'message-1',
      sessionId: 'session-1',
      role: 'user',
      kind: 'user_message',
      content: '你好',
      createdAt: '2026-08-05T04:00:00.000Z',
      metadata: {},
    });
    expect(sessionDetailSchema.parse({
      id: 'session-1',
      title: '测试会话',
      status: 'active',
      isPinned: false,
      createdAt: '2026-08-05T04:00:00.000Z',
      updatedAt: '2026-08-05T04:00:01.000Z',
      messages: [message],
    }).messages).toHaveLength(1);
  });

  it('requires a short title and non-empty session chat content', () => {
    expect(createSessionRequestSchema.parse({ title: '新的会话' }).title).toBe('新的会话');
    expect(sessionChatRequestSchema.parse({ content: '  hello  ' }).content).toBe('hello');
    expect(() => createSessionRequestSchema.parse({ title: 'x'.repeat(29) })).toThrow();
    expect(() => sessionChatRequestSchema.parse({ content: '   ' })).toThrow();
  });

  it('validates partial session updates and rejects empty patches', () => {
    expect(updateSessionRequestSchema.parse({ title: '新名称' })).toEqual({ title: '新名称' });
    expect(updateSessionRequestSchema.parse({ isPinned: true })).toEqual({ isPinned: true });
    expect(() => updateSessionRequestSchema.parse({})).toThrow();
  });
});
