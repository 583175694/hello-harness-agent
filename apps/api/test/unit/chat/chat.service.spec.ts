import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../src/database/prisma.service';
import { OpenAICompatibleModelAdapter } from '../../../src/model/openai-compatible-model.adapter';
import { DEFAULT_MODEL_ID } from '../../../src/model/model-catalog';
import { AgentRuntimeService } from '../../../src/agent-runtime/agent-runtime.service';
import { AssistantDeliveryRepository } from '../../../src/persistence/assistant-delivery.repository';
import { SessionExecutionRegistry } from '../../../src/sessions/session-execution.registry';
import { ChatService } from '../../../src/chat/chat.service';
import { ToolRegistryService } from '../../../src/tools/tool-registry.service';

// 创建不连接数据库和网络的 ChatService 测试环境。
function makeService(
  providerCreate: ReturnType<typeof vi.fn>,
  toolRegistry: Partial<ToolRegistryService> = { definitions: vi.fn(() => undefined) },
) {
  // 单测注入静默 Logger，只验证事件与持久化结果，不污染测试输出。
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
  const messageCreate = vi.fn().mockResolvedValue({});
  const sessionUpdate = vi.fn().mockResolvedValue({});
  const storedMessages = Array.from({ length: 25 }, (_, index) => ({
    id: `message-${index}`,
    userId: 'local-user',
    sessionId: 'session-1',
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    kind: index % 2 === 0 ? ('user_message' as const) : ('assistant_delivery' as const),
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
    get: vi.fn((key: string) => (key === 'OPENAI_API_KEY' ? 'test-key' : undefined)),
    getOrThrow: vi.fn(() => 'test-model'),
  };
  const executions = new SessionExecutionRegistry();
  const modelAdapter = new OpenAICompatibleModelAdapter(config as unknown as ConfigService);
  (modelAdapter as unknown as { client: OpenAI }).client = {
    chat: { completions: { create: providerCreate } },
  } as unknown as OpenAI;
  const runtimeRegistry = {
    executionPolicy: vi.fn(() => ({ timeoutMs: 30_000 })),
    ...toolRegistry,
  } as ToolRegistryService;
  const runtime = new AgentRuntimeService(modelAdapter, runtimeRegistry, logger);
  const service = new ChatService(
    config as unknown as ConfigService,
    prisma as unknown as PrismaService,
    executions,
    runtime,
    new AssistantDeliveryRepository(prisma as unknown as PrismaService, logger),
    logger,
  );
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
    const providerCreate = vi.fn().mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: '完整' } }] };
        yield { choices: [{ delta: { content: '回答' } }] };
        yield {
          choices: [],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 8,
            prompt_tokens_details: { cached_tokens: 40 },
          },
        };
      })(),
    );
    const { service, messageCreate, executions } = makeService(providerCreate);

    const prepared = await service.prepareSessionStream('session-1', 'new question');
    prepared.model = 'deepseek-v4-pro';
    prepared.reasoningEffort = 'max';
    expect(prepared.messages).toHaveLength(20);
    expect(prepared.messages[0]).toMatchObject({ id: 'message-5', content: 'content-5' });
    const events = await collect(service.streamPrepared(prepared));
    service.releaseSession('session-1');

    expect(events).toEqual([
      expect.objectContaining({
        type: 'message.delta',
        messageId: prepared.assistantMessageId,
        blockId: `${prepared.assistantMessageId}-text-1`,
        delta: '完整',
        roundSequence: 1,
        blockSequence: 0,
      }),
      expect.objectContaining({
        type: 'message.delta',
        messageId: prepared.assistantMessageId,
        blockId: `${prepared.assistantMessageId}-text-1`,
        delta: '回答',
        roundSequence: 1,
        blockSequence: 0,
      }),
      expect.objectContaining({
        type: 'model.round.completed',
        observation: expect.objectContaining({
          roundSequence: 1,
          attempt: 1,
          promptTokens: 120,
          completionTokens: 8,
          cachedTokens: 40,
        }),
      }),
      {
        type: 'message.completed',
        messageId: prepared.assistantMessageId,
        model: 'deepseek-v4-pro',
      },
    ]);
    expect(providerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-v4-pro',
        reasoning_effort: 'max',
        temperature: 0,
        max_tokens: 8_192,
      }),
      expect.anything(),
    );
    expect(messageCreate).toHaveBeenCalledTimes(2);
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        id: prepared.assistantMessageId,
        role: 'assistant',
        kind: 'assistant_delivery',
        content: '完整回答',
        metadata: {
          blocks: [
            { id: `${prepared.assistantMessageId}-text-1`, type: 'text', content: '完整回答' },
          ],
        },
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
    const providerCreate = vi.fn().mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: '不完整回答' } }] };
        yield { choices: [{ delta: {}, finish_reason: 'length' }] };
      })(),
    );
    const { service, messageCreate } = makeService(providerCreate);
    const prepared = await service.prepareSessionStream('session-1', 'new question');

    await expect(collect(service.streamPrepared(prepared))).rejects.toMatchObject({
      response: { code: 'MODEL_LENGTH_LIMIT' },
    });
    expect(messageCreate).toHaveBeenCalledTimes(1);
  });

  it('replays reasoning only for historical assistant tool-call messages', async () => {
    const providerCreate = vi.fn().mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: '新回答' }, finish_reason: 'stop' }] };
      })(),
    );
    const { service } = makeService(providerCreate);
    const prepared = await service.prepareSessionStream('session-1', 'new question');
    prepared.model = 'deepseek-v4-pro';
    prepared.reasoningEffort = 'off';
    prepared.messages = [
      { role: 'user', content: '问题一' },
      { role: 'assistant', content: '普通回答', reasoning: '不应回放的最终推理' },
      {
        role: 'assistant',
        content: '我先搜索。',
        reasoning: '必须回放的工具推理',
        toolCalls: [
          {
            id: 'call-1',
            name: 'web_search',
            arguments: '{"query":"test"}',
            blockSequence: 1,
            providerIndex: 0,
          },
        ],
      },
      { role: 'tool', toolCallId: 'call-1', content: '{"ok":true}' },
      { role: 'user', content: '问题二' },
    ];

    await collect(service.streamPrepared(prepared, undefined, { persistFinal: false }));

    const request = providerCreate.mock.calls[0]?.[0] as {
      thinking: { type: string };
      messages: Array<{ role: string; content: string | null; reasoning_content?: string }>;
    };
    expect(request.thinking).toEqual({ type: 'disabled' });
    expect(request.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: '普通回答' }),
        expect.objectContaining({
          content: '我先搜索。',
          reasoning_content: '必须回放的工具推理',
        }),
      ]),
    );
    expect(
      request.messages.find((message) => message.content === '普通回答')?.reasoning_content,
    ).toBeUndefined();
  });

  it('executes a streamed tool call and persists its recoverable snapshot', async () => {
    const providerCreate = vi
      .fn()
      .mockResolvedValueOnce(
        (async function* () {
          yield { choices: [{ delta: { reasoning_content: '搜索推理' } }] };
          yield { choices: [{ delta: { content: '我先检索。' } }] };
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-search',
                      function: { name: 'web_', arguments: '{"query":' },
                    },
                  ],
                },
              },
            ],
          };
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { name: 'search', arguments: '"latest news"}' } },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          };
        })(),
      )
      .mockResolvedValueOnce(
        (async function* () {
          yield { choices: [{ delta: { reasoning_content: '最终推理' } }] };
          yield { choices: [{ delta: { content: '检索完成。' } }] };
          yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
        })(),
      );
    const toolResult = {
      query: 'latest news',
      provider: 'serp' as const,
      results: [
        {
          id: 'result-1',
          title: 'Example',
          url: 'https://example.com/',
          domain: 'example.com',
          snippet: 'summary',
        },
      ],
    };
    const registry = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索', parameters: {} }]),
      parseInput: vi.fn(() => ({ query: 'latest news' })),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: toolResult,
        logFields: { durationMs: 10, resultCount: 1 },
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'search the web');
    const onTranscriptItem = vi.fn();
    prepared.onTranscriptItem = onTranscriptItem;
    const events = await collect(service.streamPrepared(prepared));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool.started', toolCallId: 'call-search' }),
        expect.objectContaining({ type: 'tool.completed', result: toolResult }),
        expect.objectContaining({ type: 'message.delta', delta: '检索完成。' }),
      ]),
    );
    expect(providerCreate).toHaveBeenCalledTimes(2);
    expect(events.some((event) => (event as { type?: string }).type === 'reasoning.delta')).toBe(
      false,
    );
    expect(onTranscriptItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        role: 'assistant',
        content: '我先检索。',
        reasoning: '搜索推理',
        toolCalls: [expect.objectContaining({ id: 'call-search' })],
      }),
    );
    const finalTranscript = onTranscriptItem.mock.calls.at(-1)?.[0] as {
      role: string;
      content: string;
      reasoning: string;
    };
    expect(finalTranscript).toMatchObject({ role: 'assistant', reasoning: '最终推理' });
    expect(finalTranscript.content).toContain('检索完成。');
    expect(finalTranscript.content).toContain('https://example.com/');
    expect(finalTranscript.content).not.toContain('我先检索。');
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        content: expect.stringContaining('我先检索。检索完成。'),
        metadata: {
          model: DEFAULT_MODEL_ID,
          blocks: [
            expect.objectContaining({ type: 'text', content: '我先检索。' }),
            expect.objectContaining({
              type: 'tool_activity',
              toolCallId: 'call-search',
              status: 'completed',
            }),
            expect.objectContaining({ type: 'text', content: expect.stringContaining('检索完成') }),
          ],
          agent: {
            toolCallCount: 1,
            executions: [
              expect.objectContaining({ toolCallId: 'call-search', status: 'completed' }),
            ],
            sources: [
              expect.objectContaining({
                url: 'https://example.com/',
                toolCallIds: ['call-search'],
              }),
            ],
          },
        },
      },
    });
  });

  it('reports a failed tool call and still persists the model restricted answer', async () => {
    const providerCreate = vi
      .fn()
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-failed',
                      function: { name: 'web_search', arguments: '{"query":"latest news"}' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          };
        })(),
      )
      .mockResolvedValueOnce(
        (async function* () {
          yield { choices: [{ delta: { content: '联网检索失败，当前无法验证最新信息。' } }] };
          yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
        })(),
      );
    const registry = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索', parameters: {} }]),
      parseInput: vi.fn(() => ({ query: 'latest news' })),
      execute: vi.fn().mockResolvedValue({
        status: 'timeout',
        error: { code: 'SEARCH_TIMEOUT', detail: '搜索服务响应超时。', retryable: true },
        logFields: { durationMs: 10 },
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'search the web');
    const events = await collect(service.streamPrepared(prepared));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool.started', toolCallId: 'call-failed' }),
        expect.objectContaining({
          type: 'tool.failed',
          toolCallId: 'call-failed',
          code: 'SEARCH_TIMEOUT',
        }),
        expect.objectContaining({ type: 'message.completed' }),
      ]),
    );
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

  it('projects web search followed by web fetch as one upgraded evidence candidate', async () => {
    const providerCreate = vi
      .fn()
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-search',
                      function: { name: 'web_search', arguments: '{"query":"AI evidence"}' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          };
        })(),
      )
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-fetch',
                      function: {
                        name: 'web_fetch',
                        arguments: '{"urls":["https://example.com/report"],"query":"AI evidence"}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          };
        })(),
      )
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            choices: [{ delta: { content: '已根据原文完成回答：https://example.com/report' } }],
          };
          yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
        })(),
      );
    const searchResult = {
      query: 'AI evidence',
      provider: 'serp' as const,
      results: [
        {
          id: 'result-1',
          title: 'AI Report',
          url: 'https://example.com/report',
          domain: 'example.com',
          snippet: 'search clue',
        },
      ],
    };
    const exact = 'AI adoption increased in production workflows.';
    const fetchResult = {
      query: 'AI evidence',
      results: [
        {
          status: 'succeeded' as const,
          requestedUrl: 'https://example.com/report',
          finalUrl: 'https://example.com/report',
          normalizedUrl: 'https://example.com/report',
          title: 'AI Report',
          contentType: 'text/html',
          retrievedAt: '2026-08-08T02:00:00.000Z',
          contentHash: 'content-hash',
          cacheStatus: 'miss' as const,
          truncated: false,
          passages: [
            {
              passageId: 'passage-1',
              text: exact,
              locator: {
                kind: 'web_text' as const,
                quote: { exact },
                position: { start: 0, end: Array.from(exact).length },
              },
            },
          ],
        },
      ],
      stats: {
        requestedCount: 1,
        networkAttemptCount: 1,
        succeededCount: 1,
        failedCount: 0,
        skippedCount: 0,
        passageCount: 1,
        passageCharacterCount: Array.from(exact).length,
        cacheHitCount: 0,
      },
    };
    const registry = {
      definitions: vi.fn(() => [
        { name: 'web_search', description: '搜索', parameters: {} },
        { name: 'web_fetch', description: '读取', parameters: {} },
      ]),
      parseInput: vi.fn((name: string) =>
        name === 'web_fetch'
          ? { urls: ['https://example.com/report'], query: 'AI evidence' }
          : { query: 'AI evidence' },
      ),
      execute: vi.fn((name: string) =>
        Promise.resolve(
          name === 'web_fetch'
            ? {
                status: 'succeeded' as const,
                output: fetchResult,
                logFields: {
                  durationMs: 10,
                  resultCount: 1,
                },
              }
            : {
                status: 'succeeded' as const,
                output: searchResult,
                logFields: { durationMs: 10, resultCount: 1 },
              },
        ),
      ),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'research AI');
    const events = await collect(service.streamPrepared(prepared));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool.completed', toolName: 'web_search' }),
        expect.objectContaining({
          type: 'tool.completed',
          toolName: 'web_fetch',
          result: fetchResult,
        }),
      ]),
    );
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        metadata: {
          agent: {
            toolCallCount: 2,
            sources: [
              expect.objectContaining({
                kind: 'fetched',
                used: true,
                finalUrl: 'https://example.com/report',
                toolCallIds: ['call-search', 'call-fetch'],
                passages: [expect.objectContaining({ passageId: 'passage-1' })],
              }),
            ],
          },
        },
      },
    });
    expect(JSON.stringify(messageCreate.mock.calls[1]?.[0])).not.toContain('<html');
  });

  it('projects a cancelled tool separately and updates the same activity block', async () => {
    const providerCreate = vi
      .fn()
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-cancelled',
                      function: { name: 'web_search', arguments: '{"query":"latest news"}' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          };
        })(),
      )
      .mockResolvedValueOnce(
        (async function* () {
          yield { choices: [{ delta: { content: '检索已停止。' }, finish_reason: 'stop' }] };
        })(),
      );
    const registry = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索', parameters: {} }]),
      parseInput: vi.fn(() => ({ query: 'latest news' })),
      execute: vi.fn().mockResolvedValue({
        status: 'cancelled',
        error: { code: 'SEARCH_CANCELLED', detail: '网页搜索已取消。', retryable: false },
        logFields: { durationMs: 10 },
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'stop search');
    const events = await collect(service.streamPrepared(prepared));

    const started = events.find(
      (event) => (event as { type?: string }).type === 'tool.started',
    ) as { blockId: string };
    const cancelled = events.find(
      (event) => (event as { type?: string }).type === 'tool.cancelled',
    ) as { blockId: string; code: string };
    expect(cancelled).toMatchObject({ blockId: started.blockId, code: 'SEARCH_CANCELLED' });
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        content: '检索已停止。',
        metadata: {
          blocks: [
            expect.objectContaining({
              type: 'tool_activity',
              toolCallId: 'call-cancelled',
              status: 'cancelled',
            }),
            expect.objectContaining({ type: 'text', content: '检索已停止。' }),
          ],
          agent: {
            executions: [
              expect.objectContaining({ toolCallId: 'call-cancelled', status: 'cancelled' }),
            ],
          },
        },
      },
    });
  });

  it('does not persist a partial assistant timeline when tool execution is aborted', async () => {
    const providerCreate = vi.fn().mockResolvedValue(
      (async function* () {
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-aborted',
                    function: { name: 'web_search', arguments: '{"query":"latest news"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        };
      })(),
    );
    const controller = new AbortController();
    const registry = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索', parameters: {} }]),
      parseInput: vi.fn(() => ({ query: 'latest news' })),
      execute: vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'stop search');
    const events: unknown[] = [];

    await expect(
      (async () => {
        for await (const event of service.streamPrepared(prepared, controller.signal))
          events.push(event);
      })(),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool.started', toolCallId: 'call-aborted' }),
        expect.objectContaining({
          type: 'tool.cancelled',
          toolCallId: 'call-aborted',
          code: 'TOOL_CANCELLED',
        }),
      ]),
    );
    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[0]?.[0]).toMatchObject({ data: { role: 'user' } });
  });

  it('deduplicates sources while retaining every associated tool call', async () => {
    const providerCreate = vi
      .fn()
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-first',
                      function: { name: 'web_search', arguments: '{"query":"first"}' },
                    },
                    {
                      index: 1,
                      id: 'call-second',
                      function: { name: 'web_search', arguments: '{"query":"second"}' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          };
        })(),
      )
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            choices: [
              { delta: { content: '来源：https://example.com/report' }, finish_reason: 'stop' },
            ],
          };
        })(),
      );
    const sharedResult = {
      provider: 'serp' as const,
      results: [
        {
          id: 'result-1',
          title: 'Example',
          url: 'https://example.com/report',
          domain: 'example.com',
          snippet: 'summary',
        },
      ],
    };
    const registry = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索', parameters: {} }]),
      parseInput: vi.fn(
        (_name: string, rawArguments: string) => JSON.parse(rawArguments) as { query: string },
      ),
      execute: vi.fn((_name: string, value: unknown) => {
        const input = value as { query: string };
        const output = { query: input.query, ...sharedResult };
        return Promise.resolve({
          status: 'succeeded' as const,
          output,
          logFields: { durationMs: 10, resultCount: 1 },
        });
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
            sources: [
              expect.objectContaining({
                url: 'https://example.com/report',
                toolCallIds: ['call-first', 'call-second'],
              }),
            ],
          },
        },
      },
    });
  });

  it('does not infer a forced-final transition from tool-owned control fields', async () => {
    let modelRound = 0;
    const providerCreate = vi.fn().mockImplementation(() => {
      modelRound += 1;
      if (modelRound === 1) {
        return Promise.resolve(
          (async function* () {
            yield {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call-search',
                        function: { name: 'web_search', arguments: '{"query":"test"}' },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            };
          })(),
        );
      }
      const content = modelRound === 2 ? '<｜DSML｜tool_calls>污染内容' : '经过校验的最终回答';
      return Promise.resolve(
        (async function* () {
          yield { choices: [{ delta: { content }, finish_reason: 'stop' }] };
        })(),
      );
    });
    const registry = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索', parameters: {} }]),
      parseInput: vi.fn(() => ({ query: 'test' })),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: { query: 'test', provider: 'serp', results: [] },
        logFields: { durationMs: 1, resultCount: 0 },
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'research');

    const events = await collect(service.streamPrepared(prepared));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'message.delta', delta: '<｜DSML｜tool_calls>污染内容' }),
      ]),
    );
    expect(providerCreate).toHaveBeenCalledTimes(2);
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: { content: '<｜DSML｜tool_calls>污染内容' },
    });
  });

  it('keeps ordinary model text independent from removed tool force-final controls', async () => {
    let modelRound = 0;
    const providerCreate = vi.fn().mockImplementation(() => {
      modelRound += 1;
      if (modelRound === 1) {
        return Promise.resolve(
          (async function* () {
            yield {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call-search',
                        function: { name: 'web_search', arguments: '{"query":"test"}' },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            };
          })(),
        );
      }
      return Promise.resolve(
        (async function* () {
          yield {
            choices: [
              {
                delta: { content: '<|DSML|tool_calls>污染内容' },
                finish_reason: 'stop',
              },
            ],
          };
        })(),
      );
    });
    const registry = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索', parameters: {} }]),
      parseInput: vi.fn(() => ({ query: 'test' })),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: { query: 'test', provider: 'serp', results: [] },
        logFields: { durationMs: 1, resultCount: 0 },
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'research');

    await expect(collect(service.streamPrepared(prepared))).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'message.delta', delta: '<|DSML|tool_calls>污染内容' }),
      ]),
    );

    expect(providerCreate).toHaveBeenCalledTimes(2);
    expect(messageCreate).toHaveBeenCalledTimes(2);
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: { role: 'assistant', content: '<|DSML|tool_calls>污染内容' },
    });
  });

  it('forces a tool-free final model round after the shared 20-call limit is reached', async () => {
    // 模拟模型连续请求工具的轮次，用于验证跨轮共享的调用次数上限。
    let modelRound = 0;
    const providerCreate = vi.fn().mockImplementation(() => {
      modelRound += 1;
      if (modelRound <= 20) {
        const callId = `call-${modelRound}`;
        return Promise.resolve(
          (async function* () {
            yield {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: callId,
                        function: {
                          name: 'web_search',
                          arguments: `{"query":"query ${modelRound}"}`,
                        },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            };
          })(),
        );
      }
      return Promise.resolve(
        (async function* () {
          yield {
            choices: [
              { delta: { content: '已达到工具预算，基于现有资料回答。' }, finish_reason: 'stop' },
            ],
          };
        })(),
      );
    });
    const registry = {
      definitions: vi.fn(() => [{ name: 'web_search', description: '搜索', parameters: {} }]),
      parseInput: vi.fn(
        (_name: string, rawArguments: string) => JSON.parse(rawArguments) as { query: string },
      ),
      execute: vi.fn((_name: string, value: unknown) => {
        const input = value as { query: string };
        const output = { query: input.query, provider: 'serp' as const, results: [] };
        return Promise.resolve({
          status: 'succeeded' as const,
          output,
          logFields: { durationMs: 10, resultCount: 0 },
        });
      }),
    };
    const { service, messageCreate } = makeService(providerCreate, registry);
    const prepared = await service.prepareSessionStream('session-1', 'research extensively');

    await collect(service.streamPrepared(prepared));

    expect(providerCreate).toHaveBeenCalledTimes(21);
    expect(providerCreate.mock.calls[0]?.[0]).toMatchObject({ tool_choice: 'auto' });
    expect(providerCreate.mock.calls[20]?.[0]).not.toHaveProperty('tools');
    expect(providerCreate.mock.calls[20]?.[0]).not.toHaveProperty('tool_choice');
    expect(registry.execute).toHaveBeenCalledTimes(20);
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        content: '已达到工具预算，基于现有资料回答。',
        metadata: { agent: { toolCallCount: 20 } },
      },
    });
  });
});
