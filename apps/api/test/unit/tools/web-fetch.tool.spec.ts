import { describe, expect, it, vi } from 'vitest';
import type { WebFetchService } from '../../../src/web-fetch/web-fetch.service';
import { WebFetchTool } from '../../../src/tools/web-fetch.tool';

const passage = (id: string, text: string) => ({
  passageId: id,
  text,
  locator: {
    kind: 'web_text' as const,
    quote: { exact: text },
    position: { start: 0, end: Array.from(text).length },
  },
});

describe('WebFetchTool', () => {
  it('returns canonical output with facts limited to the current call', async () => {
    const text = 'A useful fetched passage with enough detail.';
    const fetch = vi.fn().mockResolvedValue({
      result: {
        results: [
          {
            status: 'succeeded',
            requestedUrl: 'https://example.com/a',
            finalUrl: 'https://example.com/a',
            normalizedUrl: 'https://example.com/a',
            title: 'A',
            contentType: 'text/html',
            retrievedAt: '2026-08-09T00:00:00.000Z',
            contentHash: 'hash-a',
            cacheStatus: 'miss',
            truncated: false,
            passages: [passage('p1', text)],
          },
          {
            status: 'skipped',
            requestedUrl: 'https://example.com/a#fragment',
            code: 'FETCH_DUPLICATE_SKIPPED',
            detail: '当前批次已经包含等价网页地址。',
          },
        ],
      },
      networkAttempts: 1,
    });
    const tool = new WebFetchTool({ fetch } as unknown as WebFetchService);
    const result = await tool.execute(
      { urls: ['https://example.com/a', 'https://example.com/a#fragment'] },
      { sessionId: 'session-1', messageId: 'message-1', toolCallId: 'call-1' },
    );

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.output.stats).toEqual({
      requestedCount: 2,
      networkAttemptCount: 1,
      succeededCount: 1,
      failedCount: 0,
      skippedCount: 1,
      passageCount: 1,
      passageCharacterCount: Array.from(text).length,
      cacheHitCount: 0,
    });
    expect(result.logFields).toMatchObject({ 成功: 1, 跳过: 1, 网络请求: 1, Passage: `${Array.from(text).length} 字` });
  });

  it('passes a model-proposed public URL directly to the capability service', async () => {
    const fetch = vi.fn().mockResolvedValue({
      result: {
        results: [
          {
            status: 'failed',
            requestedUrl: 'https://invented.example/article',
            code: 'FETCH_UPSTREAM_FAILED',
            detail: '网页暂时不可用。',
          },
        ],
      },
      networkAttempts: 1,
    });
    const tool = new WebFetchTool({ fetch } as unknown as WebFetchService);
    const result = await tool.execute(
      { urls: ['https://invented.example/article'] },
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        toolCallId: 'call-model-proposed',
      },
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.output.results[0]).toMatchObject({ status: 'failed' });
    expect(result.output.stats).toMatchObject({ requestedCount: 1, failedCount: 1 });
  });

  it('calculates every stats field for guard failures, cache hits, retries, and partial results', async () => {
    const cachedText = 'Cached passage.';
    const networkText = 'Network passage 😀.';
    const urls = [
      'https://cache.example/article',
      'https://network.example/article',
      'https://private.example/article',
      'https://failed.example/article',
      'https://network.example/article#duplicate',
    ];
    const succeeded = (
      requestedUrl: string,
      cacheStatus: 'hit' | 'miss',
      text: string,
      hash: string,
    ) => ({
      status: 'succeeded' as const,
      requestedUrl,
      finalUrl: requestedUrl,
      normalizedUrl: requestedUrl,
      title: requestedUrl,
      contentType: 'text/html',
      retrievedAt: '2026-08-11T00:00:00.000Z',
      contentHash: hash,
      cacheStatus,
      truncated: false,
      passages: [passage(`passage-${hash}`, text)],
    });
    const fetch = vi.fn().mockResolvedValue({
      result: {
        results: [
          succeeded(urls[0]!, 'hit', cachedText, 'cache-hash'),
          succeeded(urls[1]!, 'miss', networkText, 'network-hash'),
          {
            status: 'failed',
            requestedUrl: urls[2],
            code: 'FETCH_PRIVATE_ADDRESS',
            detail: '网页地址指向受限网络。',
          },
          {
            status: 'failed',
            requestedUrl: urls[3],
            code: 'FETCH_TIMEOUT',
            detail: '网页读取超时。',
          },
          {
            status: 'skipped',
            requestedUrl: urls[4],
            code: 'FETCH_DUPLICATE_SKIPPED',
            detail: '当前批次已经包含等价网页地址。',
          },
        ],
      },
      // 一个首次请求加一次 retry，另一个成功网络请求，共三次 transport attempt。
      networkAttempts: 3,
    });
    const tool = new WebFetchTool({ fetch } as unknown as WebFetchService);
    const result = await tool.execute(
      { urls },
      { sessionId: 'session-1', messageId: 'message-1', toolCallId: 'call-mixed' },
    );

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.output.stats).toEqual({
      requestedCount: 5,
      networkAttemptCount: 3,
      succeededCount: 2,
      failedCount: 2,
      skippedCount: 1,
      passageCount: 2,
      passageCharacterCount:
        Array.from(cachedText).length + Array.from(networkText).length,
      cacheHitCount: 1,
    });
  });
});
