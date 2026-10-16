import { afterEach, describe, expect, it, vi } from 'vitest';

import { BadGatewayException } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

import { fetchJson, UpstreamHttpError } from '../../../src/shared/fetch-json';
import { describeLogAgentUpstreamError, describeLogError } from '../../../src/shared/logging.utils';

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

  it('expands wrapped agent HttpException to the model upstream cause for run logs', () => {
    const upstream = Object.assign(new Error('502 Bad Gateway'), {
      name: 'APIError',
      status: 502,
      requestID: 'req-stream-9',
      responseBody: { error: { message: 'upstream overloaded' } },
    });
    const wrapped = new BadGatewayException(
      {
        code: AGENT_ERROR_CODES.modelStreamInterrupted,
        detail: '模型响应流意外中断，本次回答未完成。',
      },
      { cause: upstream },
    );

    const detail = describeLogAgentUpstreamError(wrapped);
    expect(detail).toContain('对外码=MODEL_STREAM_INTERRUPTED');
    expect(detail).toContain('模型上游=');
    expect(detail).toContain('APIError: 502 Bad Gateway');
    expect(detail).toContain('HTTP=502');
    expect(detail).toContain('请求ID=req-stream-9');
    expect(detail).toContain('upstream overloaded');
  });

  it('unwraps wrapped HttpException in describeLogError', () => {
    const upstream = new Error('socket hang up');
    const wrapped = new BadGatewayException(
      { code: AGENT_ERROR_CODES.modelRequestFailed, detail: '模型供应商返回失败，本次回答未完成。' },
      { cause: upstream },
    );
    expect(describeLogError(wrapped)).toContain('模型上游=Error: socket hang up');
  });
});
