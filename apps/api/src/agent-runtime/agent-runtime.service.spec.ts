import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { ModelAdapter } from '../model/model-adapter';
import type { ToolRegistryService } from '../tools/tool-registry.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

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

  it('rejects a web fetch call that would exceed the ten-url run budget', async () => {
    let round = 0;
    const calls = [
      { id: 'fetch-1', name: 'web_fetch', arguments: JSON.stringify({ urls: Array.from({ length: 5 }, (_, index) => `https://example.com/a${index}`) }) },
      { id: 'fetch-2', name: 'web_fetch', arguments: JSON.stringify({ urls: Array.from({ length: 5 }, (_, index) => `https://example.com/b${index}`) }) },
      { id: 'fetch-3', name: 'web_fetch', arguments: JSON.stringify({ urls: ['https://example.com/overflow'] }) },
    ];
    const model = {
      streamRound: vi.fn(async function* () {
        const call = calls[round];
        round += 1;
        if (call) {
          yield { type: 'tool_calls.completed' as const, calls: [call] };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '根据已有来源作答。' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter;
    const tools = {
      definitions: vi.fn(() => [{ name: 'web_fetch', description: '读取网页', parameters: {} }]),
      parseInput: vi.fn((_name: string, raw: string) => JSON.parse(raw)),
      units: vi.fn((_name: string, input: { urls: string[] }) => ({ units: input.urls.length, limit: 10 })),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: { results: [] },
        modelContent: '{"results":[]}',
        metrics: { durationMs: 1 },
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

    expect(tools.execute).toHaveBeenCalledTimes(2);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool.failed',
        toolCallId: 'fetch-3',
        code: AGENT_ERROR_CODES.fetchBudgetExceeded,
      }),
      expect.objectContaining({ type: 'text.delta', delta: '根据已有来源作答。' }),
    ]));
  });
});
