import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service';
import { SessionExecutionRegistry } from '../sessions/session-execution.registry';
import { ChatService } from './chat.service';
import { ToolRegistryService } from '../tools/tool-registry.service';

// 创建不连接数据库和网络的 ChatService 测试环境。
function makeService(
  providerCreate: ReturnType<typeof vi.fn>,
  toolRegistry: Partial<ToolRegistryService> = { definitions: vi.fn(() => undefined) },
) {
  const messageCreate = vi.fn().mockResolvedValue({});
  const sessionUpdate = vi.fn().mockResolvedValue({});
  const storedMessages = Array.from({ length: 25 }, (_, index) => ({
    id: `message-${index}`,
    userId: 'local-user',
    sessionId: 'session-1',
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    kind: index % 2 === 0 ? 'user_message' as const : 'assistant_delivery' as const,
    content: `content-${index}`,
    createdAt: new Date(1_700_000_000_000 + index),
    metadata: {},
  }));
  const prisma = {
    session: {
      findFirst: vi.fn().mockResolvedValue({ id: 'session-1', userId: 'local-user' }),
      update: sessionUpdate,
    },
    message: {
      create: messageCreate,
      findMany: vi.fn().mockResolvedValue(storedMessages.slice(-20).reverse()),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const config = {
    get: vi.fn((key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : undefined),
    getOrThrow: vi.fn(() => 'test-model'),
  };
  const executions = new SessionExecutionRegistry();
  const service = new ChatService(
    config as unknown as ConfigService,
    prisma as unknown as PrismaService,
    executions,
    toolRegistry as ToolRegistryService,
  );
  (service as unknown as { client: OpenAI }).client = {
    chat: { completions: { create: providerCreate } },
  } as unknown as OpenAI;
  return { service, messageCreate, executions, prisma };
}

// 收集异步事件流，确保生成器完整执行到持久化阶段。
async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const values: unknown[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

describe('ChatService session persistence', () => {
  it('loads only the latest 20 database messages and persists a completed assistant', async () => {
    const providerCreate = vi.fn().mockResolvedValue((async function* () {
      yield { choices: [{ delta: { content: '完整' } }] };
      yield { choices: [{ delta: { content: '回答' } }] };
    })());
    const { service, messageCreate, executions } = makeService(providerCreate);

    const prepared = await service.prepareSessionStream('session-1', 'new question');
    expect(prepared.messages).toHaveLength(20);
    expect(prepared.messages[0]).toMatchObject({ id: 'message-5', content: 'content-5' });
    const events = await collect(service.streamPrepared(prepared));
    service.releaseSession('session-1');

    expect(events).toEqual([
      { type: 'message.delta', messageId: prepared.assistantMessageId, delta: '完整' },
      { type: 'message.delta', messageId: prepared.assistantMessageId, delta: '回答' },
      { type: 'message.completed', messageId: prepared.assistantMessageId, model: 'test-model' },
    ]);
    expect(messageCreate).toHaveBeenCalledTimes(2);
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        id: prepared.assistantMessageId,
        role: 'assistant',
        kind: 'assistant_delivery',
        content: '完整回答',
      },
    });
    expect(executions.isActive('session-1')).toBe(false);
  });

  it('retains only the user message when the provider fails', async () => {
    const providerCreate = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    const { service, messageCreate } = makeService(providerCreate);
    const prepared = await service.prepareSessionStream('session-1', 'new question');

    await expect(collect(service.streamPrepared(prepared))).rejects.toThrow();
    service.releaseSession('session-1');
    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { role: 'user', kind: 'user_message', content: 'new question' },
    });
  });

  it('does not persist a length-truncated assistant response', async () => {
    const providerCreate = vi.fn().mockResolvedValue((async function* () {
      yield { choices: [{ delta: { content: '不完整回答' } }] };
      yield { choices: [{ delta: {}, finish_reason: 'length' }] };
    })());
    const { service, messageCreate } = makeService(providerCreate);
    const prepared = await service.prepareSessionStream('session-1', 'new question');

    await expect(collect(service.streamPrepared(prepared))).rejects.toMatchObject({
      response: { code: 'MODEL_LENGTH_LIMIT' },
    });
    expect(messageCreate).toHaveBeenCalledTimes(1);
  });

  it('executes a streamed tool call and persists its recoverable snapshot', async () => {
    const providerCreate = vi.fn()
      .mockResolvedValueOnce((async function* () {
        yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-search', function: { name: 'web_', arguments: '{"query":' } }] } }] };
        yield { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'search', arguments: '"latest news"}' } }] }, finish_reason: 'tool_calls' }] };
      })())
      .mockResolvedValueOnce((async function* () {
        yield { choices: [{ delta: { content: '检索完成：https://example.com/' } }] };
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      })());
    const toolResult = {
      query: 'latest news',
      provider: 'serp' as const,
      results: [{
        id: 'result-1', title: 'Example', url: 'https://example.com/', domain: 'example.com', snippet: 'summary',
      }],
    };
    const registry = {
      definitions: vi.fn(() => [{ type: 'function' as const, function: { name: 'web_search', parameters: {} } }]),
      parseInput: vi.fn(() => ({ query: 'latest news' })),
      execute: vi.fn().mockResolvedValue({ ok: true, input: { query: 'latest news' }, result: toolResult }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'search the web');
    const events = await collect(service.streamPrepared(prepared));

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool.started', toolCallId: 'call-search' }),
      expect.objectContaining({ type: 'tool.completed', result: toolResult }),
      expect.objectContaining({ type: 'message.delta', delta: '检索完成：https://example.com/' }),
    ]));
    expect(providerCreate).toHaveBeenCalledTimes(2);
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        metadata: {
          model: 'test-model',
          agent: {
            toolCallCount: 1,
            executions: [expect.objectContaining({ toolCallId: 'call-search', status: 'completed' })],
            sources: [expect.objectContaining({ url: 'https://example.com/', toolCallIds: ['call-search'] })],
          },
        },
      },
    });
  });

  it('reports a failed tool call and still persists the model restricted answer', async () => {
    const providerCreate = vi.fn()
      .mockResolvedValueOnce((async function* () {
        yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-failed', function: { name: 'web_search', arguments: '{"query":"latest news"}' } }] }, finish_reason: 'tool_calls' }] };
      })())
      .mockResolvedValueOnce((async function* () {
        yield { choices: [{ delta: { content: '联网检索失败，当前无法验证最新信息。' } }] };
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      })());
    const registry = {
      definitions: vi.fn(() => [{ type: 'function' as const, function: { name: 'web_search', parameters: {} } }]),
      parseInput: vi.fn(() => ({ query: 'latest news' })),
      execute: vi.fn().mockResolvedValue({
        ok: false,
        input: { query: 'latest news' },
        code: 'SEARCH_TIMEOUT',
        detail: '搜索服务响应超时。',
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'search the web');
    const events = await collect(service.streamPrepared(prepared));

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool.started', toolCallId: 'call-failed' }),
      expect.objectContaining({ type: 'tool.failed', toolCallId: 'call-failed', code: 'SEARCH_TIMEOUT' }),
      expect.objectContaining({ type: 'message.completed' }),
    ]));
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        content: '联网检索失败，当前无法验证最新信息。',
        metadata: {
          agent: {
            toolCallCount: 1,
            executions: [expect.objectContaining({ toolCallId: 'call-failed', status: 'failed' })],
            sources: [],
          },
        },
      },
    });
  });

  it('deduplicates sources while retaining every associated tool call', async () => {
    const providerCreate = vi.fn()
      .mockResolvedValueOnce((async function* () {
        yield {
          choices: [{
            delta: {
              tool_calls: [
                { index: 0, id: 'call-first', function: { name: 'web_search', arguments: '{"query":"first"}' } },
                { index: 1, id: 'call-second', function: { name: 'web_search', arguments: '{"query":"second"}' } },
              ],
            },
            finish_reason: 'tool_calls',
          }],
        };
      })())
      .mockResolvedValueOnce((async function* () {
        yield { choices: [{ delta: { content: '来源：https://example.com/report' }, finish_reason: 'stop' }] };
      })());
    const sharedResult = {
      provider: 'serp' as const,
      results: [{
        id: 'result-1', title: 'Example', url: 'https://example.com/report', domain: 'example.com', snippet: 'summary',
      }],
    };
    const registry = {
      definitions: vi.fn(() => [{ type: 'function' as const, function: { name: 'web_search', parameters: {} } }]),
      parseInput: vi.fn((_name: string, rawArguments: string) => JSON.parse(rawArguments) as { query: string }),
      execute: vi.fn((_name: string, rawArguments: string) => {
        const input = JSON.parse(rawArguments) as { query: string };
        return Promise.resolve({ ok: true as const, input, result: { query: input.query, ...sharedResult } });
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'compare sources');

    await collect(service.streamPrepared(prepared));

    expect(registry.execute).toHaveBeenCalledTimes(2);
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        metadata: {
          agent: {
            toolCallCount: 2,
            executions: [
              expect.objectContaining({ toolCallId: 'call-first' }),
              expect.objectContaining({ toolCallId: 'call-second' }),
            ],
            sources: [expect.objectContaining({
              url: 'https://example.com/report',
              toolCallIds: ['call-first', 'call-second'],
            })],
          },
        },
      },
    });
  });

  it('forces a tool-free final model round after the shared 20-call budget is exhausted', async () => {
    let modelRound = 0;
    const providerCreate = vi.fn().mockImplementation(() => {
      modelRound += 1;
      if (modelRound <= 20) {
        const callId = `call-${modelRound}`;
        return Promise.resolve((async function* () {
          yield { choices: [{ delta: { tool_calls: [{ index: 0, id: callId, function: { name: 'web_search', arguments: `{"query":"query ${modelRound}"}` } }] }, finish_reason: 'tool_calls' }] };
        })());
      }
      return Promise.resolve((async function* () {
        yield { choices: [{ delta: { content: '已达到工具预算，基于现有资料回答。' }, finish_reason: 'stop' }] };
      })());
    });
    const registry = {
      definitions: vi.fn(() => [{ type: 'function' as const, function: { name: 'web_search', parameters: {} } }]),
      parseInput: vi.fn((_name: string, rawArguments: string) => JSON.parse(rawArguments) as { query: string }),
      execute: vi.fn((_name: string, rawArguments: string) => {
        const input = JSON.parse(rawArguments) as { query: string };
        return Promise.resolve({
          ok: true as const,
          input,
          result: { query: input.query, provider: 'serp' as const, results: [] },
        });
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'research extensively');

    await collect(service.streamPrepared(prepared));

    expect(providerCreate).toHaveBeenCalledTimes(21);
    expect(providerCreate.mock.calls[20]?.[0]).toMatchObject({ tool_choice: 'none' });
    expect(registry.execute).toHaveBeenCalledTimes(20);
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        content: '已达到工具预算，基于现有资料回答。',
        metadata: { agent: { toolCallCount: 20 } },
      },
    });
  });
});
