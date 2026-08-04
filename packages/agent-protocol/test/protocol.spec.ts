import { describe, expect, it } from 'vitest';

import { problemDetailsSchema, protocolVersion, serviceStatusSchema } from '../src/index.js';

describe('foundation protocol', () => {
  it('exports a stable protocol version', () => {
    expect(protocolVersion).toBe('0.1.0');
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
});
