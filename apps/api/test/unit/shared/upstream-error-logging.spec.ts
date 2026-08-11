import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchJson, UpstreamHttpError } from '../../../src/shared/fetch-json';
import { describeLogError } from '../../../src/shared/logging.utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('upstream error logging', () => {
  it('retains the upstream status, safe URL, request id and response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid api key', apiKey: 'super-secret-value' }), {
          status: 401,
          headers: { 'x-request-id': 'provider-request-123' },
        }),
      ),
    );

    const failure = await fetchJson('https://search.example/v1/search?token=query-secret').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(UpstreamHttpError);
    expect(failure).toMatchObject({
      status: 401,
      url: 'https://search.example/v1/search',
      requestId: 'provider-request-123',
    });
    const detail = describeLogError(failure);
    expect(detail).toContain('HTTP=401');
    expect(detail).toContain('请求ID=provider-request-123');
    expect(detail).toContain('invalid api key');
    expect(detail).toContain('apiKey":"[REDACTED]');
    expect(detail).not.toContain('super-secret-value');
    expect(detail).not.toContain('query-secret');
  });

  it('describes OpenAI-compatible errors and their root cause', () => {
    const root = new Error('connect ECONNREFUSED 10.0.0.8:443');
    const error = Object.assign(new Error('401 authentication failed', { cause: root }), {
      name: 'AuthenticationError',
      status: 401,
      code: 'invalid_api_key',
      type: 'authentication_error',
      requestID: 'req-model-1',
    });

    expect(describeLogError(error)).toBe(
      'AuthenticationError: 401 authentication failed | HTTP=401 | 供应商错误码=invalid_api_key | 类型=authentication_error | 请求ID=req-model-1 | 根因=Error: connect ECONNREFUSED 10.0.0.8:443',
    );
  });
});
