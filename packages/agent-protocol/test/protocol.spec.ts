import { describe, expect, it } from 'vitest';

import {
  chatStreamEventSchema,
  problemDetailsSchema,
  protocolVersion,
  serviceStatusSchema,
  toolCallSchema,
} from '../src/index.js';

describe('foundation protocol', () => {
  it('exports a stable protocol version', () => {
    expect(protocolVersion).toBe('0.2.0');
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
});
