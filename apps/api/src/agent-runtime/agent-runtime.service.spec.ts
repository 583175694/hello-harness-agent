import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { ModelAdapter } from '../model/model-adapter';
import type { ToolRegistryService } from '../tools/tool-registry.service';
import { AgentRuntimeService } from './agent-runtime.service';

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
});
