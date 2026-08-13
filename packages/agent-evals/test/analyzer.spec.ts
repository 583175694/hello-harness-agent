import { describe, expect, it } from 'vitest';
import type { ChatStreamEvent, SessionDetail } from '@harness/agent-protocol';
import { analyzeCase } from '../src/analyzer.js';
import { selectCases } from '../src/cases.js';

const session = (content: string, metadata: Record<string, unknown> = {}): SessionDetail => ({
  id: 'session-1',
  title: 'eval',
  status: 'active',
  isPinned: false,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:01:00.000Z',
  activeRun: null,
  messages: [
    {
      id: 'assistant-1',
      sessionId: 'session-1',
      role: 'assistant',
      kind: 'assistant_delivery',
      content,
      createdAt: '2026-08-10T00:01:00.000Z',
      metadata,
    },
  ],
});

describe('analyzeCase', () => {
  it('passes a persisted direct answer without tool calls', () => {
    const events: ChatStreamEvent[] = [
      {
        type: 'message.delta',
        messageId: 'assistant-1',
        blockId: 'text-1',
        delta: '回答',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
      },
      { type: 'message.completed', messageId: 'assistant-1', model: 'test' },
    ];
    const result = analyzeCase(
      selectCases('smoke', 'direct-event-loop')[0]!,
      events,
      session('回答'),
      100,
    );
    expect(result.rules.every((rule) => rule.passed)).toBe(true);
  });

  it('allows a model-proposed public URL and keeps structured failures observable', () => {
    const testCase = selectCases('smoke', 'direct-node-url')[0]!;
    const events: ChatStreamEvent[] = [
      {
        type: 'tool.started',
        messageId: 'assistant-1',
        blockId: 'tool-1',
        toolCallId: 'call-1',
        toolName: 'web_fetch',
        title: '读取网页',
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
        input: { urls: ['https://invented.example/a'] },
        startedAt: '2026-08-10T00:00:00.000Z',
      },
      {
        type: 'tool.failed',
        messageId: 'assistant-1',
        blockId: 'tool-1',
        toolCallId: 'call-1',
        toolName: 'web_fetch',
        completedAt: '2026-08-10T00:00:01.000Z',
        durationMs: 1000,
        code: 'FETCH_URL_NOT_ALLOWED',
        detail: 'not allowed',
        retryable: false,
        roundId: 'round-1',
        roundSequence: 1,
        blockSequence: 0,
      },
      { type: 'message.completed', messageId: 'assistant-1', model: 'test' },
    ];
    const result = analyzeCase(testCase, events, session('受限回答'), 1000);
    expect(result.rules.some((rule) => rule.id === 'fetch_provenance')).toBe(false);
    expect(result.rules.find((rule) => rule.id === 'tool_terminal')).toMatchObject({
      passed: true,
    });
  });

  it('treats repeated fetches as efficiency metrics and still rejects unknown answer links', () => {
    const testCase = selectCases('smoke', 'direct-node-url')[0]!;
    const target = 'https://nodejs.org/api/events.html';
    const events: ChatStreamEvent[] = [
      fetchStarted('call-1', target),
      fetchCompleted('call-1', target),
      fetchStarted('call-2', target),
      fetchCompleted('call-2', target),
      { type: 'message.completed', messageId: 'assistant-1', model: 'test' },
    ];
    const metadata = {
      model: 'test',
      agent: {
        toolCallCount: 2,
        executions: [execution('call-1', target), execution('call-2', target)],
        sources: [fetchedSource(target, false)],
      },
    };
    const result = analyzeCase(
      testCase,
      events,
      session('回答 https://unknown.example/fact', metadata),
      1000,
    );
    expect(result.rules.some((rule) => rule.id === 'duplicate_fetch')).toBe(false);
    expect(result.rules.some((rule) => rule.id === 'stop_respected')).toBe(false);
    expect(result.rules.find((rule) => rule.id === 'answer_links_known')).toMatchObject({
      passed: false,
    });
    expect(result.rules.find((rule) => rule.id === 'fetched_preferred')).toMatchObject({
      passed: false,
    });
    expect(result.metrics).toMatchObject({
      fetchCalls: 2,
      networkAttempts: 4,
      uniqueDocuments: 1,
      duplicateFetchCount: 1,
      modelProposedSourceCount: 0,
    });
  });

  it('rejects unknown provenance and sources that remain mergeable by content hash', () => {
    const testCase = selectCases('smoke', 'direct-node-url')[0]!;
    const firstUrl = 'https://example.com/original';
    const secondUrl = 'https://mirror.example/original';
    const metadata = {
      model: 'test',
      agent: {
        toolCallCount: 2,
        executions: [],
        sources: [
          {
            ...fetchedSource(firstUrl, false),
            id: 'source-model',
            provenance: 'model_proposed',
          },
          {
            ...fetchedSource(secondUrl, false),
            id: 'source-unknown',
            provenance: 'unknown',
          },
        ],
      },
    };
    const result = analyzeCase(
      testCase,
      [{ type: 'message.completed', messageId: 'assistant-1', model: 'test' }],
      session('受限回答', metadata),
      100,
    );

    expect(result.rules.find((rule) => rule.id === 'source_provenance')).toMatchObject({
      passed: false,
    });
    expect(result.rules.find((rule) => rule.id === 'canonical_sources')).toMatchObject({
      passed: false,
    });
    expect(result.metrics.modelProposedSourceCount).toBe(1);
  });

  it('uses persisted toolCallCount as the tool-call limit fact source', () => {
    const baseCase = selectCases('smoke', 'direct-node-url')[0]!;
    const testCase = {
      ...baseCase,
      expectations: { ...baseCase.expectations, maxToolCalls: 1 },
    };
    const metadata = {
      model: 'test',
      agent: { toolCallCount: 2, executions: [], sources: [] },
    };
    const result = analyzeCase(
      testCase,
      [{ type: 'message.completed', messageId: 'assistant-1', model: 'test' }],
      session('回答', metadata),
      100,
    );

    expect(result.rules.find((rule) => rule.id === 'tool_call_limit')).toMatchObject({
      passed: false,
      detail: expect.stringContaining('工具调用 2 次'),
    });
  });
});

// 构造网页读取开始事件，便于验证顺序相关硬规则。
function fetchStarted(toolCallId: string, url: string): ChatStreamEvent {
  return {
    type: 'tool.started',
    messageId: 'assistant-1',
    blockId: `block-${toolCallId}`,
    toolCallId,
    toolName: 'web_fetch',
    title: '读取网页',
    roundId: 'round-1',
    roundSequence: 1,
    blockSequence: 0,
    input: { urls: [url] },
    startedAt: '2026-08-10T00:00:00.000Z',
  };
}

// 构造与 SSE 工具调用相匹配的持久化 execution snapshot。
function execution(toolCallId: string, url: string) {
  return {
    toolCallId,
    toolName: 'web_fetch',
    input: { urls: [url] },
    status: 'completed',
    startedAt: '2026-08-10T00:00:00.000Z',
    completedAt: '2026-08-10T00:00:01.000Z',
    durationMs: 1000,
    roundId: 'round-1',
    roundSequence: 1,
    blockSequence: 0,
  } as const;
}

// 构造带单次事实统计的网页读取完成事件。
function fetchCompleted(toolCallId: string, url: string): ChatStreamEvent {
  return {
    type: 'tool.completed',
    messageId: 'assistant-1',
    blockId: `block-${toolCallId}`,
    toolCallId,
    toolName: 'web_fetch',
    completedAt: '2026-08-10T00:00:01.000Z',
    durationMs: 1000,
    roundId: 'round-1',
    roundSequence: 1,
    blockSequence: 0,
    result: {
      results: [
        { status: 'failed', requestedUrl: url, code: 'FETCH_UPSTREAM_FAILED', detail: 'failed' },
      ],
      stats: {
        requestedCount: 1,
        networkAttemptCount: 2,
        succeededCount: 0,
        failedCount: 1,
        skippedCount: 0,
        passageCount: 0,
        passageCharacterCount: 0,
        cacheHitCount: 0,
      },
    },
  };
}

// 构造符合协议但尚未被最终回答采用的已读来源快照。
function fetchedSource(url: string, used: boolean) {
  return {
    kind: 'fetched',
    used,
    id: 'source-1',
    requestedUrl: url,
    finalUrl: url,
    normalizedUrl: url,
    title: 'Node.js Events',
    contentType: 'text/html',
    retrievedAt: '2026-08-10T00:00:00.000Z',
    contentHash: 'hash',
    cacheStatus: 'miss',
    truncated: false,
    passages: [
      {
        passageId: 'passage-1',
        text: 'EventEmitter',
        locator: {
          kind: 'web_text',
          quote: { exact: 'EventEmitter' },
          position: { start: 0, end: 12 },
        },
      },
    ],
    toolCallIds: ['call-1'],
    provenance: 'user_provided',
  } as const;
}
