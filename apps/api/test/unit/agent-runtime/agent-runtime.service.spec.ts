import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { ModelAdapter } from '../../../src/model/model-adapter';
import type { ToolRegistryService } from '../../../src/tools/tool-registry.service';
import { AgentRuntimeService } from '../../../src/agent-runtime/agent-runtime.service';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import { UpstreamHttpError } from '../../../src/shared/fetch-json';

// 创建可从测试侧控制继续时机的 Promise。
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('AgentRuntimeService streaming', () => {
  it('logs the retained upstream reason when a tool returns a provider failure', async () => {
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [
              {
                id: 'call-search',
                name: AGENT_TOOL_NAMES.webSearch,
                arguments: '{"query":"market"}',
              },
            ],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '搜索失败。' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [
        { name: AGENT_TOOL_NAMES.webSearch, description: '搜索网页', parameters: {} },
      ]),
      parseInput: vi.fn(() => ({ query: 'market' })),
      execute: vi.fn().mockResolvedValue({
        status: 'failed',
        error: {
          code: 'SEARCH_PROVIDER_FAILED',
          detail: '网页搜索暂时不可用。',
          retryable: true,
          cause: new UpstreamHttpError(
            401,
            'https://search.example/v1/search',
            '{"error":"invalid subscription token"}',
            'provider-request-1',
          ),
        },
        modelContent: '{"ok":false,"code":"SEARCH_PROVIDER_FAILED"}',
        logFields: { durationMs: 1 },
      }),
    } as unknown as ToolRegistryService;
    const logger = { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
    const runtime = new AgentRuntimeService(model, tools, logger);

    for await (const event of runtime.run({
      sessionId: 'session-1',
      messageId: 'message-1',
      model: 'test-model',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hello' }],
    }))
      void event;

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('错误码=SEARCH_PROVIDER_FAILED'),
      AgentRuntimeService.name,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('durationMs=1'),
      AgentRuntimeService.name,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '上游原因=UpstreamHttpError: 上游 HTTP 请求失败，状态码：401 | HTTP=401 | 请求ID=provider-request-1 | 上游=https://search.example/v1/search | 响应={"error":"invalid subscription token"}',
      ),
      AgentRuntimeService.name,
    );
  });

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

    await expect(stream.next()).resolves.toEqual({
      value: { type: 'text.delta', delta: '首字' },
      done: false,
    });
    gate.resolve();
    await expect(stream.next()).resolves.toEqual({
      value: { type: 'text.delta', delta: '继续' },
      done: false,
    });
    await expect(stream.next()).resolves.toEqual({
      value: { type: 'run.completed', content: '首字继续', toolCallCount: 0 },
      done: false,
    });
  });

  it('emits tool cancellation as a distinct lifecycle event', async () => {
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [{ id: 'call-1', name: 'web_search', arguments: '{"query":"test"}' }],
          };
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
        logFields: { durationMs: 1 },
      }),
    } as unknown as ToolRegistryService;
    const logger = { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
    const runtime = new AgentRuntimeService(model, tools, logger);
    const events: Array<{ type: string }> = [];

    for await (const event of runtime.run({
      sessionId: 'session-1',
      messageId: 'message-1',
      model: 'test-model',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hello' }],
    }))
      events.push(event);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool.started', toolCallId: 'call-1' }),
        expect.objectContaining({
          type: 'tool.cancelled',
          toolCallId: 'call-1',
          code: 'SEARCH_CANCELLED',
        }),
        expect.objectContaining({ type: 'text.delta', delta: '已停止检索。' }),
      ]),
    );
  });

  it('keeps arbitrary tools exposed without interpreting their identities', async () => {
    let round = 0;
    const definitionExclusions: Set<string>[] = [];
    const definitions = vi.fn((excluded: ReadonlySet<string>) => {
      definitionExclusions.push(new Set(excluded));
      return ['catalog_lookup', 'document_reader']
        .filter((name) => !excluded.has(name))
        .map((name) => ({ name, description: name, parameters: {} }));
    });
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [{ id: 'lookup-1', name: 'catalog_lookup', arguments: '{"query":"market"}' }],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        if (round === 2) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [
              {
                id: 'reader-1',
                name: 'document_reader',
                arguments: '{"documentId":"market-report"}',
              },
            ],
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
      execute: vi.fn((name: string) =>
        Promise.resolve({
          status: 'succeeded' as const,
          output: {},
          modelContent: '{}',
          logFields: { 条目: 1 },
          ...(name === 'catalog_lookup' ? { control: { disableTools: ['catalog_lookup'] } } : {}),
        }),
      ),
    } as unknown as ToolRegistryService;
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;
    const runtime = new AgentRuntimeService(model, tools, logger);

    for await (const event of runtime.run({
      sessionId: 'session-1',
      messageId: 'message-1',
      model: 'test-model',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: '分析市场' }],
    }))
      void event;

    expect(definitionExclusions).toEqual([
      new Set(),
      new Set(['catalog_lookup']),
      new Set(['catalog_lookup']),
    ]);
    expect(tools.execute).toHaveBeenNthCalledWith(
      1,
      'catalog_lookup',
      { query: 'market' },
      expect.any(Object),
    );
    expect(tools.execute).toHaveBeenNthCalledWith(
      2,
      'document_reader',
      { documentId: 'market-report' },
      expect.any(Object),
    );
    const firstContext = (tools.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];
    const secondContext = (tools.execute as ReturnType<typeof vi.fn>).mock.calls[1]?.[2];
    expect(firstContext).toMatchObject({ latestUserContent: '分析市场' });
    expect(secondContext.runState).toBe(firstContext.runState);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('工具=document_reader | 状态=成功 | 条目=1'),
      AgentRuntimeService.name,
    );
  });

  it('enters a tool-free final round and silently completes later calls from the same response', async () => {
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [
              {
                id: 'fetch-1',
                name: 'document_reader',
                arguments: JSON.stringify({ urls: ['https://example.com/a'] }),
              },
              {
                id: 'fetch-2',
                name: 'document_reader',
                arguments: JSON.stringify({ urls: ['https://example.com/b'] }),
              },
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
      definitions: vi.fn(() => [
        { name: 'document_reader', description: '读取文档', parameters: {} },
      ]),
      parseInput: vi.fn((_name: string, raw: string) => JSON.parse(raw)),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: { results: [], budget: {} },
        modelContent: '{"results":[],"budget":{}}',
        control: { forceFinalAnswer: true },
      }),
    } as unknown as ToolRegistryService;
    const runtime = new AgentRuntimeService(model, tools, {
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger);
    const events = [];
    for await (const event of runtime.run({
      sessionId: 'session-1',
      messageId: 'message-1',
      model: 'test-model',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'research' }],
    }))
      events.push(event);

    expect(tools.execute).toHaveBeenCalledTimes(1);
    expect(tools.definitions).toHaveBeenCalledTimes(1);
    expect(tools.definitions).toHaveBeenCalledWith(new Set());
    expect(model.streamRound).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tools: undefined, forceFinalAnswer: true }),
    );
    expect(events.filter((event) => event.type === 'tool.started')).toHaveLength(1);
    expect(events.some((event) => event.type === 'tool.failed')).toBe(false);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text.delta', delta: '根据已有来源作答。' }),
      ]),
    );
    expect(events.at(-1)).toMatchObject({ type: 'run.completed', toolCallCount: 2 });
  });

  it('uses per-model timeouts while passing only the user cancellation signal to tools', async () => {
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(new AbortController().signal);
    const external = new AbortController();
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [
              { id: 'search-1', name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"test"}' },
            ],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '基于已有材料作答。' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [
        { name: AGENT_TOOL_NAMES.webSearch, description: '搜索', parameters: {} },
      ]),
      parseInput: vi.fn(() => ({ query: 'test' })),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: {},
        modelContent: '{}',
        control: { forceFinalAnswer: true },
      }),
    } as unknown as ToolRegistryService;
    const runtime = new AgentRuntimeService(model, tools, {
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger);
    const events = [];

    for await (const event of runtime.run({
      sessionId: 'session-1',
      messageId: 'message-1',
      model: 'test-model',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'research' }],
      signal: external.signal,
    }))
      events.push(event);

    expect(timeoutSpy).toHaveBeenNthCalledWith(1, 120_000);
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, 30_000);
    expect(tools.execute).toHaveBeenCalledWith(
      AGENT_TOOL_NAMES.webSearch,
      { query: 'test' },
      expect.objectContaining({ signal: external.signal }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text.delta', delta: '基于已有材料作答。' }),
      ]),
    );
    expect(model.streamRound).toHaveBeenCalledTimes(2);
    timeoutSpy.mockRestore();
  });

  it('buffers a forced final answer and discards DSML before retrying once', async () => {
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [
              { id: 'search-1', name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"test"}' },
            ],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        if (round === 2) {
          yield { type: 'text.delta' as const, delta: '<｜DSML｜tool_calls>污染内容' };
          yield { type: 'round.completed' as const, finishReason: 'stop' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '合法' };
        yield { type: 'text.delta' as const, delta: '回答' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [
        { name: AGENT_TOOL_NAMES.webSearch, description: '搜索', parameters: {} },
      ]),
      parseInput: vi.fn(() => ({ query: 'test' })),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: {},
        modelContent: '{}',
        logFields: { durationMs: 1 },
        control: {
          disableTools: [AGENT_TOOL_NAMES.webSearch, AGENT_TOOL_NAMES.webFetch],
          forceFinalAnswer: true,
        },
      }),
    } as unknown as ToolRegistryService;
    const runtime = new AgentRuntimeService(model, tools, {
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger);
    const events = [];

    for await (const event of runtime.run({
      sessionId: 'session-1',
      messageId: 'message-1',
      model: 'test-model',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'research' }],
    }))
      events.push(event);

    expect(model.streamRound).toHaveBeenCalledTimes(3);
    expect(events.filter((event) => event.type === 'text.delta')).toEqual([
      { type: 'text.delta', delta: '合法' },
      { type: 'text.delta', delta: '回答' },
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'run.completed', content: '合法回答' });
  });

  it('rejects two corrupted forced answers without yielding their text', async () => {
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [
              { id: 'search-1', name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"test"}' },
            ],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '<|DSML|tool_calls>污染内容' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [
        { name: AGENT_TOOL_NAMES.webSearch, description: '搜索', parameters: {} },
      ]),
      parseInput: vi.fn(() => ({ query: 'test' })),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: {},
        modelContent: '{}',
        logFields: { durationMs: 1 },
        control: { forceFinalAnswer: true },
      }),
    } as unknown as ToolRegistryService;
    const runtime = new AgentRuntimeService(model, tools, {
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger);
    const events: Array<{ type: string }> = [];

    await expect(async () => {
      for await (const event of runtime.run({
        sessionId: 'session-1',
        messageId: 'message-1',
        model: 'test-model',
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'research' }],
      }))
        events.push(event);
    }).rejects.toMatchObject({ response: { code: 'MODEL_STREAM_FAILED' } });

    expect(model.streamRound).toHaveBeenCalledTimes(3);
    expect(events.some((event) => event.type === 'text.delta')).toBe(false);
    expect(events.some((event) => event.type === 'run.completed')).toBe(false);
  });

  it('retries a structured tool call returned during the forced final phase', async () => {
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round <= 2) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: [
              {
                id: `call-${round}`,
                name: AGENT_TOOL_NAMES.webSearch,
                arguments: '{"query":"test"}',
              },
            ],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '最终回答' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [
        { name: AGENT_TOOL_NAMES.webSearch, description: '搜索', parameters: {} },
      ]),
      parseInput: vi.fn(() => ({ query: 'test' })),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: {},
        modelContent: '{}',
        logFields: { durationMs: 1 },
        control: { forceFinalAnswer: true },
      }),
    } as unknown as ToolRegistryService;
    const runtime = new AgentRuntimeService(model, tools, {
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger);
    const events = [];

    for await (const event of runtime.run({
      sessionId: 'session-1',
      messageId: 'message-1',
      model: 'test-model',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'research' }],
    }))
      events.push(event);

    expect(tools.execute).toHaveBeenCalledTimes(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text.delta', delta: '最终回答' }),
        expect.objectContaining({ type: 'run.completed', content: '最终回答' }),
      ]),
    );
  });

  it('counts invalid calls in one response and stops exactly at the shared limit', async () => {
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          yield {
            type: 'tool_calls.completed' as const,
            calls: Array.from({ length: 22 }, (_, index) => ({
              id: `call-${index + 1}`,
              name: AGENT_TOOL_NAMES.webSearch,
              arguments: '{}',
            })),
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '工具预算已结束。' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [
        { name: AGENT_TOOL_NAMES.webSearch, description: '搜索', parameters: {} },
      ]),
      parseInput: vi.fn(() => {
        throw new Error('INVALID_TOOL_ARGUMENTS');
      }),
      execute: vi.fn(),
    } as unknown as ToolRegistryService;
    const runtime = new AgentRuntimeService(model, tools, {
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger);
    const events = [];

    for await (const event of runtime.run({
      sessionId: 'session-1',
      messageId: 'message-1',
      model: 'test-model',
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'research' }],
    }))
      events.push(event);

    expect(tools.parseInput).toHaveBeenCalledTimes(20);
    expect(tools.execute).not.toHaveBeenCalled();
    expect(model.streamRound).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      content: '工具预算已结束。',
      toolCallCount: 20,
    });
  });
});
