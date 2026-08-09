import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { ModelAdapter } from '../model/model-adapter';
import type { ToolRegistryService } from '../tools/tool-registry.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

// 创建可从测试侧控制继续时机的 Promise。
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('AgentRuntimeService streaming', () => {
  it('yields the first text delta before a tool-enabled model round finishes', async () => {
    const gate = deferred();
    const model = {
      streamRound: vi.fn(async function* () {
        yield { type: 'text.delta' as const, delta: '首字' };
        await gate.promise;
        yield { type: 'text.delta' as const, delta: '继续' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索网页', parameters: {} }]),
    } as unknown as ToolRegistryService;
    const logger = { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
    const runtime = new AgentRuntimeService(model, tools, logger);
    const stream = runtime.run({
      sessionId: 'session-1',
      messageId: 'message-1',
      model: 'test-model',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hello' }],
    });

    await expect(stream.next()).resolves.toEqual({ value: { type: 'text.delta', delta: '首字' }, done: false });
    gate.resolve();
    await expect(stream.next()).resolves.toEqual({ value: { type: 'text.delta', delta: '继续' }, done: false });
    await expect(stream.next()).resolves.toEqual({ value: { type: 'run.completed', content: '首字继续', toolCallCount: 0 }, done: false });
  });

  it('emits tool cancellation as a distinct lifecycle event', async () => {
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield { type: 'tool_calls.completed' as const, calls: [{ id: 'call-1', name: 'web_search', arguments: '{"query":"test"}' }] };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '已停止检索。' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索网页', parameters: {} }]),
      parseInput: vi.fn(() => ({ query: 'test' })),
      execute: vi.fn().mockResolvedValue({
        status: 'cancelled',
        error: { code: 'SEARCH_CANCELLED', detail: '网页搜索已取消。', retryable: false },
        modelContent: '{"ok":false,"code":"SEARCH_CANCELLED"}',
        metrics: { durationMs: 1 },
      }),
    } as unknown as ToolRegistryService;
    const logger = { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
    const runtime = new AgentRuntimeService(model, tools, logger);
    const events = [];

    for await (const event of runtime.run({
      sessionId: 'session-1', messageId: 'message-1', model: 'test-model',
      systemPrompt: 'test', messages: [{ role: 'user', content: 'hello' }],
    })) events.push(event);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool.started', toolCallId: 'call-1' }),
      expect.objectContaining({ type: 'tool.cancelled', toolCallId: 'call-1', code: 'SEARCH_CANCELLED' }),
      expect.objectContaining({ type: 'text.delta', delta: '已停止检索。' }),
    ]));
  });

  it('keeps search and fetch exposed while search registers clue URLs for execution', async () => {
    let round = 0;
    const definitions = vi.fn((excluded: ReadonlySet<string>) => [
      AGENT_TOOL_NAMES.webSearch,
      AGENT_TOOL_NAMES.webFetch,
    ].filter((name) => !excluded.has(name)).map((name) => ({ name, description: name, parameters: {} })));
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [{ id: 'search-1', name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"market"}' }],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        if (round === 2) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [{
              id: 'fetch-1',
              name: AGENT_TOOL_NAMES.webFetch,
              arguments: '{"urls":["https://example.com/market"]}',
            }],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '基于已读取来源作答。' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions,
      parseInput: vi.fn((_name: string, raw: string) => JSON.parse(raw)),
      execute: vi.fn((name: string, _input: unknown, context: { resources: { allowFetchUrls(urls: string[]): void } }) => {
        if (name === AGENT_TOOL_NAMES.webSearch) {
          context.resources.allowFetchUrls(['https://example.com/market']);
        }
        return Promise.resolve({
          status: 'succeeded' as const,
          output: {},
          modelContent: '{}',
          metrics: { durationMs: 1 },
        });
      }),
    } as unknown as ToolRegistryService;
    const runtime = new AgentRuntimeService(
      model,
      tools,
      { log: vi.fn(), warn: vi.fn() } as unknown as Logger,
    );

    for await (const event of runtime.run({
      sessionId: 'session-1', messageId: 'message-1', model: 'test-model',
      systemPrompt: 'test', messages: [{ role: 'user', content: '分析市场' }],
    })) void event;

    expect(definitions.mock.calls[0]?.[0].has(AGENT_TOOL_NAMES.webFetch)).toBe(false);
    expect(definitions.mock.calls[0]?.[0].has(AGENT_TOOL_NAMES.webSearch)).toBe(false);
    expect(definitions.mock.calls[1]?.[0].has(AGENT_TOOL_NAMES.webFetch)).toBe(false);
    expect(tools.execute).toHaveBeenNthCalledWith(
      1,
      AGENT_TOOL_NAMES.webSearch,
      { query: 'market' },
      expect.any(Object),
    );
    expect(tools.execute).toHaveBeenNthCalledWith(
      2,
      AGENT_TOOL_NAMES.webFetch,
      { urls: ['https://example.com/market'] },
      expect.any(Object),
    );
  });

  it('removes stopped research tools and silently completes later calls from the same response', async () => {
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [
              { id: 'fetch-1', name: AGENT_TOOL_NAMES.webFetch, arguments: JSON.stringify({ urls: ['https://example.com/a'] }) },
              { id: 'fetch-2', name: AGENT_TOOL_NAMES.webFetch, arguments: JSON.stringify({ urls: ['https://example.com/b'] }) },
            ],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '根据已有来源作答。' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn((excluded: ReadonlySet<string>) => excluded.has(AGENT_TOOL_NAMES.webFetch)
        ? undefined
        : [{ name: AGENT_TOOL_NAMES.webFetch, description: '读取网页', parameters: {} }]),
      parseInput: vi.fn((_name: string, raw: string) => JSON.parse(raw)),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: { results: [], budget: {} },
        modelContent: '{"results":[],"budget":{}}',
        metrics: { durationMs: 1 },
        control: {
          disableTools: [AGENT_TOOL_NAMES.webSearch, AGENT_TOOL_NAMES.webFetch],
          forceFinalAnswer: true,
        },
      }),
    } as unknown as ToolRegistryService;
    const runtime = new AgentRuntimeService(
      model,
      tools,
      { log: vi.fn(), warn: vi.fn() } as unknown as Logger,
    );
    const events = [];
    for await (const event of runtime.run({
      sessionId: 'session-1', messageId: 'message-1', model: 'test-model',
      systemPrompt: 'test', messages: [{ role: 'user', content: 'research' }],
    })) events.push(event);

    expect(tools.execute).toHaveBeenCalledTimes(1);
    expect(tools.definitions).toHaveBeenLastCalledWith(expect.objectContaining({
      has: expect.any(Function),
    }));
    expect((tools.definitions as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toEqual(
      new Set([AGENT_TOOL_NAMES.webSearch, AGENT_TOOL_NAMES.webFetch]),
    );
    expect(events.filter((event) => event.type === 'tool.started')).toHaveLength(1);
    expect(events.some((event) => event.type === 'tool.failed')).toBe(false);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text.delta', delta: '根据已有来源作答。' }),
    ]));
  });

  it('turns an internally timed-out tool exception into one forced final answer round', async () => {
    const normalSignal = new AbortController().signal;
    const timedOut = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
      .mockReturnValueOnce(normalSignal)
      .mockImplementationOnce(() => {
        queueMicrotask(() => timedOut.abort());
        return timedOut.signal;
      })
      .mockReturnValue(normalSignal);
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [{ id: 'search-1', name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"test"}' }],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '调查超时，以现有材料作答。' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [{ name: AGENT_TOOL_NAMES.webSearch, description: '搜索', parameters: {} }]),
      parseInput: vi.fn(() => ({ query: 'test' })),
      execute: vi.fn(async (_name: string, _input: unknown, context: { signal: AbortSignal }) => {
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true });
        });
      }),
    } as unknown as ToolRegistryService;
    const runtime = new AgentRuntimeService(
      model,
      tools,
      { log: vi.fn(), warn: vi.fn() } as unknown as Logger,
    );
    const events = [];

    for await (const event of runtime.run({
      sessionId: 'session-1', messageId: 'message-1', model: 'test-model',
      systemPrompt: 'test', messages: [{ role: 'user', content: 'research' }],
    })) events.push(event);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool.failed',
        toolCallId: 'search-1',
        code: 'AGENT_RESEARCH_TIMEOUT',
      }),
      expect.objectContaining({ type: 'text.delta', delta: '调查超时，以现有材料作答。' }),
    ]));
    expect(model.streamRound).toHaveBeenCalledTimes(2);
    timeoutSpy.mockRestore();
  });
});
