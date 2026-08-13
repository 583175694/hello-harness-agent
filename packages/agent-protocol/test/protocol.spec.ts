import { describe, expect, it } from 'vitest';

import {
  chatStreamEventSchema,
  createRunRequestSchema,
  runSnapshotSchema,
  runStreamEventSchema,
  createSessionRequestSchema,
  persistedMessageSchema,
  problemDetailsSchema,
  protocolVersion,
  serviceStatusSchema,
  sessionDetailSchema,
  toolCallSchema,
  updateSessionRequestSchema,
  assistantAgentMetadataSchema,
  normalizeSourceUrl,
  webFetchInputSchema,
  webFetchResultSchema,
} from '../src/index.js';

describe('foundation protocol', () => {
  it('exports a stable protocol version', () => {
    expect(protocolVersion).toBe('0.10.0');
  });

  it('normalizes source URLs deterministically without deleting business parameters', () => {
    expect(
      normalizeSourceUrl(
        'https://EXAMPLE.com:443/article?b=2&utm_source=news&id=7&a=1&fbclid=tracking#section',
      ),
    ).toBe('https://example.com/article?a=1&b=2&id=7');
    expect(normalizeSourceUrl('http://example.com:80/path?ref=home&lang=zh')).toBe(
      'http://example.com/path?lang=zh&ref=home',
    );
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
        blockId: 'block_1',
        delta: 'hello',
        roundId: 'round_1',
        roundSequence: 1,
        blockSequence: 0,
      }),
    ).toMatchObject({ type: 'message.delta', messageId: 'msg_1' });
    expect(
      chatStreamEventSchema.parse({
        type: 'tool.started',
        messageId: 'msg_1',
        blockId: 'tool_1',
        toolCallId: 'call_1',
        toolName: 'web_search',
        title: '搜索网页',
        roundId: 'round_1',
        roundSequence: 1,
        blockSequence: 0,
        input: { query: 'test' },
        startedAt: '2026-08-07T09:00:00.000Z',
      }),
    ).toMatchObject({ type: 'tool.started', title: '搜索网页' });
    expect(
      chatStreamEventSchema.parse({
        type: 'tool.cancelled',
        messageId: 'msg_1',
        blockId: 'tool_1',
        toolCallId: 'call_1',
        toolName: 'web_search',
        roundId: 'round_1',
        roundSequence: 1,
        blockSequence: 0,
        completedAt: '2026-08-07T09:00:01.000Z',
        durationMs: 1000,
        code: 'SEARCH_CANCELLED',
        detail: '网页搜索已取消。',
      }),
    ).toMatchObject({ type: 'tool.cancelled', code: 'SEARCH_CANCELLED' });
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
    expect(
      sessionDetailSchema.parse({
        id: 'session-1',
        title: '测试会话',
        status: 'active',
        isPinned: false,
        createdAt: '2026-08-05T04:00:00.000Z',
        updatedAt: '2026-08-05T04:00:01.000Z',
        messages: [message],
        activeRun: null,
      }).messages,
    ).toHaveLength(1);
  });

  it('requires a short title and non-empty session chat content', () => {
    expect(createSessionRequestSchema.parse({ title: '新的会话' }).title).toBe('新的会话');
    expect(
      createRunRequestSchema.parse({ content: '  hello  ', model: 'deepseek-v4-flash', idempotencyKey: 'request-1' }).content,
    ).toBe('hello');
    expect(() => createSessionRequestSchema.parse({ title: 'x'.repeat(29) })).toThrow();
    expect(() =>
      createRunRequestSchema.parse({ content: '   ', model: 'deepseek-v4-flash', idempotencyKey: 'request-1' }),
    ).toThrow();
  });

  it('validates durable run snapshots and sequenced SSE envelopes', () => {
    const snapshot = runSnapshotSchema.parse({
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'running',
      profile: {
        provider: 'deepseek',
        model: 'DeepSeek-V4-Pro',
        reasoningEffort: 'high',
        reasoningFormat: 'deepseek.reasoning_content.v1',
      },
      assistantMessageId: 'assistant-1',
      assistantContent: '',
      blocks: [],
      executions: [],
      sources: [],
      toolCallCount: 0,
      lastEventSequence: 0,
      createdAt: '2026-08-12T00:00:00.000Z',
    });
    expect(
      runStreamEventSchema.parse({
        version: '0.10.0',
        eventId: 'event-1',
        seq: 0,
        sessionId: 'session-1',
        runId: 'run-1',
        type: 'run.snapshot',
        occurredAt: '2026-08-12T00:00:00.000Z',
        payload: snapshot,
      }),
    ).toMatchObject({ type: 'run.snapshot', seq: 0 });
  });

  it('validates partial session updates and rejects empty patches', () => {
    expect(updateSessionRequestSchema.parse({ title: '新名称' })).toEqual({ title: '新名称' });
    expect(updateSessionRequestSchema.parse({ isPinned: true })).toEqual({ isPinned: true });
    expect(() => updateSessionRequestSchema.parse({})).toThrow();
  });

  it('validates batch web fetch input and rejects unsafe shapes', () => {
    expect(
      webFetchInputSchema.parse({
        urls: ['https://example.com/a', 'https://example.com/b'],
        query: '  产业落地证据  ',
      }),
    ).toEqual({
      urls: ['https://example.com/a', 'https://example.com/b'],
      query: '产业落地证据',
    });
    expect(() => webFetchInputSchema.parse({ urls: [] })).toThrow();
    expect(() => webFetchInputSchema.parse({ urls: ['ftp://example.com/file'] })).toThrow();
    expect(() =>
      webFetchInputSchema.parse({
        urls: Array.from({ length: 6 }, (_, index) => `https://example.com/${index}`),
      }),
    ).toThrow();
    expect(() =>
      webFetchInputSchema.parse({
        urls: ['https://example.com'],
        headers: { authorization: 'secret' },
      }),
    ).toThrow();
  });

  it('validates partial web fetch results and code-point locators', () => {
    const exact = '原文😀片段';
    const result = webFetchResultSchema.parse({
      query: '原文',
      results: [
        {
          status: 'succeeded',
          requestedUrl: 'https://example.com/a',
          finalUrl: 'https://example.com/a',
          normalizedUrl: 'https://example.com/a',
          title: '示例来源',
          contentType: 'text/html',
          retrievedAt: '2026-08-08T02:00:00.000Z',
          contentHash: 'hash',
          cacheStatus: 'miss',
          truncated: false,
          passages: [
            {
              passageId: 'passage-1',
              text: exact,
              locator: {
                kind: 'web_text',
                quote: { exact },
                position: { start: 10, end: 10 + Array.from(exact).length },
              },
            },
          ],
        },
        {
          status: 'failed',
          requestedUrl: 'https://example.com/b',
          code: 'FETCH_TIMEOUT',
          detail: '网页读取超时。',
        },
        {
          status: 'skipped',
          requestedUrl: 'https://example.com/a?utm_source=test',
          code: 'FETCH_DUPLICATE_SKIPPED',
          detail: '本轮已读取过等价网页。',
        },
      ],
      stats: {
        requestedCount: 3,
        networkAttemptCount: 2,
        succeededCount: 1,
        failedCount: 1,
        skippedCount: 1,
        passageCount: 1,
        passageCharacterCount: Array.from(exact).length,
        cacheHitCount: 0,
      },
    });
    expect(result.results).toHaveLength(3);
    expect(() =>
      webFetchResultSchema.parse({
        ...result,
        results: [
          {
            ...(result.results[0] as object),
            passages: [
              {
                passageId: 'invalid',
                text: exact,
                locator: {
                  kind: 'web_text',
                  quote: { exact },
                  position: { start: 0, end: 2 },
                },
              },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      webFetchResultSchema.parse({
        ...result,
        results: [
          {
            ...(result.results[0] as object),
            passages: [
              {
                passageId: 'mismatched-quote',
                text: exact,
                locator: {
                  kind: 'web_text',
                  quote: { exact: '长度相同但内容不同' },
                  position: { start: 0, end: Array.from('长度相同但内容不同').length },
                },
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it('restores legacy provenance defaults and strips retired execution budget fields', () => {
    const parsed = assistantAgentMetadataSchema.parse({
      model: 'test-model',
      agent: {
        toolCallCount: 1,
        executions: [
          {
            toolCallId: 'call-1',
            toolName: 'web_search',
            input: { query: 'test' },
            status: 'completed',
            startedAt: '2026-08-08T02:00:00.000Z',
            completedAt: '2026-08-08T02:00:01.000Z',
            durationMs: 1000,
            budget: { legacy: true },
          },
        ],
        sources: [
          {
            id: 'result-1',
            title: '旧来源',
            url: 'https://example.com',
            domain: 'example.com',
            snippet: '旧摘要',
            provider: 'serp',
            kind: 'clue',
            used: false,
            retrievedAt: '2026-08-08T02:00:01.000Z',
            toolCallIds: ['call-1'],
          },
          {
            kind: 'fetched',
            used: false,
            id: 'fetched-1',
            requestedUrl: 'https://example.com/article',
            finalUrl: 'https://example.com/article',
            normalizedUrl: 'https://example.com/article',
            title: '旧已读来源',
            contentType: 'text/html',
            retrievedAt: '2026-08-08T02:00:01.000Z',
            contentHash: 'legacy-hash',
            cacheStatus: 'miss',
            truncated: false,
            passages: [],
            toolCallIds: ['call-1'],
          },
        ],
      },
    });
    expect(parsed.agent?.sources[0]).toMatchObject({
      kind: 'clue',
      provenance: 'search_clue',
    });
    expect(parsed.agent?.sources[1]).toMatchObject({
      kind: 'fetched',
      provenance: 'unknown',
    });
    expect(parsed.agent?.executions[0]).not.toHaveProperty('budget');
    expect(() =>
      assistantAgentMetadataSchema.parse({
        ...parsed,
        agent: {
          ...parsed.agent,
          sources: [{ ...parsed.agent?.sources[0], kind: 'evidence_candidate' }],
        },
      }),
    ).toThrow();
  });
});
