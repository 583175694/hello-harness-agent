import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { AGENT_ERROR_CODES, AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import { AgentRuntimeService } from '../../../src/agent-runtime/agent-runtime.service';
import type { ContextEngineeringService } from '../../../src/context-engineering/context-engineering.service';
import type { ModelAdapter, ModelRoundInput } from '../../../src/model/model-adapter';
import type { ToolRegistryService } from '../../../src/tools/tool-registry.service';
import {
  RuntimeLifecycleController,
  type RuntimeLifecycleEvent,
  type RuntimeLifecycleHook,
} from '../../../src/agent-runtime/runtime-lifecycle';

type RoundEvent =
  | { type: 'text.delta'; delta: string }
  | { type: 'reasoning.delta'; delta: string }
  | {
      type: 'tool_calls.completed';
      calls: Array<{ id: string; name: string; arguments: string }>;
    }
  | {
      type: 'clarification.completed';
      request: { question: string; options: string[]; allowFreeText: boolean };
    }
  | { type: 'round.completed'; finishReason: string | null };

// 从固定轮次数组构造供应商无关的模型测试替身。
function modelFromRounds(rounds: RoundEvent[][]): ModelAdapter & {
  streamRound: ReturnType<typeof vi.fn>;
} {
  let round = 0;
  return {
    streamRound: vi.fn(async function* () {
      for (const event of rounds[round++] ?? []) yield event;
    }),
  } as unknown as ModelAdapter & { streamRound: ReturnType<typeof vi.fn> };
}

// 构造带参数解析、执行策略和调用记录的 Registry 测试替身。
function registry(overrides: Partial<ToolRegistryService> = {}): ToolRegistryService & {
  execute: ReturnType<typeof vi.fn>;
} {
  return {
    definitions: vi.fn(() => [
      { name: AGENT_TOOL_NAMES.webSearch, description: '搜索网页', parameters: {} },
      { name: AGENT_TOOL_NAMES.webFetch, description: '读取网页', parameters: {} },
    ]),
    parseInput: vi.fn((_name: string, raw: string) => JSON.parse(raw)),
    executionPolicy: vi.fn((name: string) => ({
      timeoutMs: name === AGENT_TOOL_NAMES.webFetch ? 45_000 : 10_000,
    })),
    execute: vi.fn().mockResolvedValue({ status: 'succeeded', output: { value: 'ok' } }),
    ...overrides,
  } as unknown as ToolRegistryService & { execute: ReturnType<typeof vi.fn> };
}

// 收集 Runtime 事件直到 run.completed 或异常。
async function collect(
  runtime: AgentRuntimeService,
  signal?: AbortSignal,
  lifecycle?: RuntimeLifecycleController,
) {
  const events = [];
  for await (const event of runtime.run({
    sessionId: 'session-1',
    messageId: 'message-1',
    model: 'test-model',
    systemPrompt: 'test',
    messages: [{ role: 'user', content: 'hello' }],
    signal,
    lifecycle,
  }))
    events.push(event);
  return events;
}

// 返回不输出控制台内容的 Logger 替身。
function logger(): Logger {
  return { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
}

describe('AgentRuntimeService model-led tool boundary', () => {
  it('persists clarification request and response facts with the same interrupt id', async () => {
    const model = modelFromRounds([
      [
        {
          type: 'clarification.completed',
          request: {
            question: '选择环境',
            options: ['测试', '生产'],
            allowFreeText: false,
          },
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '已选择测试环境' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const lifecycle = new RuntimeLifecycleController('run-1');
    const execution = collect(
      new AgentRuntimeService(model, registry(), logger()),
      undefined,
      lifecycle,
    );
    await vi.waitFor(() => expect(lifecycle.snapshot().activeInterrupt?.kind).toBe('clarification'));
    const interruptId = lifecycle.snapshot().activeInterrupt!.interruptId;
    lifecycle.respond(interruptId, '测试');

    const events = await execution;
    const facts = events.filter((event) => event.type === 'transcript.fact');
    expect(facts).toEqual([
      expect.objectContaining({
        fact: expect.objectContaining({ kind: 'clarification_request', interruptId }),
      }),
      expect.objectContaining({
        fact: expect.objectContaining({ kind: 'clarification_response', interruptId }),
      }),
    ]);
    expect(model.streamRound).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['approve', true, 'approved_by_user'],
    ['reject', false, 'rejected_by_user'],
  ] as const)(
    'records %s tool approval as a durable control outcome without replaying the model round',
    async (decision, executes, controlOutcome) => {
      const model = modelFromRounds([
        [
          {
            type: 'tool_calls.completed',
            calls: [
              {
                id: 'approval-call',
                name: AGENT_TOOL_NAMES.approvalTest,
                arguments: '{"message":"audit"}',
              },
            ],
          },
          { type: 'round.completed', finishReason: 'tool_calls' },
        ],
        [
          { type: 'text.delta', delta: '审批完成' },
          { type: 'round.completed', finishReason: 'stop' },
        ],
      ]);
      const tools = registry({
        approvalPolicy: vi.fn(() => 'require_approval'),
      } as Partial<ToolRegistryService>);
      const lifecycle = new RuntimeLifecycleController('run-1');
      const execution = collect(
        new AgentRuntimeService(model, tools, logger()),
        undefined,
        lifecycle,
      );
      await vi.waitFor(() => expect(lifecycle.snapshot().activeInterrupt?.kind).toBe('tool_approval'));
      const interrupt = lifecycle.snapshot().activeInterrupt!;
      if (interrupt.kind !== 'tool_approval') throw new Error('expected tool approval');
      const item = interrupt.payload.items[0]!;
      lifecycle.decideApproval(interrupt.interruptId, [
        {
          itemId: item.itemId,
          toolCallId: item.toolCallId,
          argumentsHash: item.argumentsHash,
          decision,
        },
      ]);

      const events = await execution;
      const toolMessage = events.find(
        (event) => event.type === 'transcript.item' && event.message.role === 'tool',
      );
      expect(toolMessage).toMatchObject({
        type: 'transcript.item',
        message: { role: 'tool', toolCallId: 'approval-call', controlOutcome },
      });
      expect(tools.execute).toHaveBeenCalledTimes(executes ? 1 : 0);
      expect(model.streamRound).toHaveBeenCalledTimes(2);
    },
  );
  it('reports strongly ordered lifecycle boundaries with prepared dispatch context', async () => {
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'call-1',
              name: AGENT_TOOL_NAMES.webSearch,
              arguments: '{"query":"market"}',
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '完成回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const observed: RuntimeLifecycleEvent[] = [];
    const observer: RuntimeLifecycleHook = {
      onBoundary(event) {
        observed.push(event);
        return undefined;
      },
    };
    const lifecycle = new RuntimeLifecycleController('run-1', undefined, [observer]);

    await collect(new AgentRuntimeService(model, registry(), logger()), undefined, lifecycle);

    expect(observed.map(({ boundary }) => boundary)).toEqual([
      'before_model_request',
      'model_round_classified',
      'tool_dispatch_ready',
      'tool_batch_committed',
      'before_model_request',
      'model_round_classified',
      'final_answer',
    ]);
    expect(observed[2]).toMatchObject({
      boundary: 'tool_dispatch_ready',
      context: {
        roundSequence: 1,
        dispatchPlan: [
          {
            status: 'ready',
            call: { id: 'call-1', providerIndex: 0 },
            input: { query: 'market' },
          },
        ],
      },
    });
    expect(observed[3]).toMatchObject({
      boundary: 'tool_batch_committed',
      context: {
        nextAction: 'model_request',
        results: [{ toolCallId: 'call-1', status: 'succeeded' }],
      },
    });
  });

  it('pauses before the first model request without launching the model', async () => {
    const model = modelFromRounds([
      [
        { type: 'text.delta', delta: '完成回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const lifecycle = new RuntimeLifecycleController('run-1');
    lifecycle.requestPause();

    const execution = collect(
      new AgentRuntimeService(model, registry(), logger()),
      undefined,
      lifecycle,
    );
    await vi.waitFor(() => expect(lifecycle.snapshot().state).toBe('paused'));
    expect(model.streamRound).not.toHaveBeenCalled();

    lifecycle.resume();
    await execution;
    expect(model.streamRound).toHaveBeenCalledOnce();
  });

  it('finishes the in-flight model tool batch before pausing and resumes at the next round', async () => {
    let releaseFirstRound!: () => void;
    let reportFirstRoundStarted!: () => void;
    const firstRoundStarted = new Promise<void>((resolve) => {
      reportFirstRoundStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseFirstRound = resolve;
    });
    let round = 0;
    const model = {
      streamRound: vi.fn(async function* () {
        round += 1;
        if (round === 1) {
          reportFirstRoundStarted();
          await release;
          yield {
            type: 'tool_calls.completed' as const,
            calls: [
              {
                id: 'call-1',
                name: AGENT_TOOL_NAMES.webSearch,
                arguments: '{"query":"market"}',
              },
            ],
          };
          yield { type: 'round.completed' as const, finishReason: 'tool_calls' };
          return;
        }
        yield { type: 'text.delta' as const, delta: '完成回答' };
        yield { type: 'round.completed' as const, finishReason: 'stop' };
      }),
    } as unknown as ModelAdapter & { streamRound: ReturnType<typeof vi.fn> };
    const tools = registry();
    const lifecycle = new RuntimeLifecycleController('run-1');
    const execution = collect(
      new AgentRuntimeService(model, tools, logger()),
      undefined,
      lifecycle,
    );

    await firstRoundStarted;
    lifecycle.requestPause();
    releaseFirstRound();
    await vi.waitFor(() => expect(lifecycle.snapshot().state).toBe('paused'));
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(model.streamRound).toHaveBeenCalledOnce();

    lifecycle.resume();
    await execution;
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(model.streamRound).toHaveBeenCalledTimes(2);
  });

  it('keeps reasoning in transcript items without emitting a user-facing reasoning event', async () => {
    const model = modelFromRounds([
      [
        { type: 'reasoning.delta', delta: '内部推理' },
        { type: 'text.delta', delta: '最终回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);

    const events = await collect(new AgentRuntimeService(model, registry(), logger()));

    expect(events.some((event) => (event as { type: string }).type === 'reasoning.delta')).toBe(
      false,
    );
    expect(events).toContainEqual({
      type: 'transcript.item',
      message: { role: 'assistant', content: '最终回答', reasoning: '内部推理' },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model.round.completed',
          context: expect.objectContaining({
            roundSequence: 1,
            messages: [
              { role: 'system', content: 'test' },
              { role: 'user', content: 'hello' },
            ],
          }),
        }),
      ]),
    );
  });

  it('serializes canonical success output instead of consuming tool-owned model content', async () => {
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'call-1',
              name: AGENT_TOOL_NAMES.webSearch,
              arguments: '{"query":"market"}',
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '完成回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: { query: 'market', results: [] },
        logFields: { 结果: 0 },
      }),
    });
    const events = await collect(new AgentRuntimeService(model, tools, logger()));

    const secondInput = model.streamRound.mock.calls[1]![0] as ModelRoundInput;
    expect(secondInput.messages.findLast((message) => message.role === 'tool')).toEqual({
      role: 'tool',
      toolCallId: 'call-1',
      content: JSON.stringify({
        ok: true,
        untrustedToolData: true,
        output: { query: 'market', results: [] },
      }),
    });
    const assistantToolCallIndex = secondInput.messages.findIndex(
      (message) => message.role === 'assistant' && message.toolCalls?.length,
    );
    const toolResultIndex = secondInput.messages.findIndex((message) => message.role === 'tool');
    expect(assistantToolCallIndex).toBeGreaterThanOrEqual(0);
    expect(toolResultIndex).toBeGreaterThan(assistantToolCallIndex);
    const rounds = events.filter((event) => event.type === 'model.round.completed');
    expect(rounds[0]).toEqual(
      expect.objectContaining({
        context: expect.objectContaining({
          response: expect.objectContaining({
            role: 'assistant',
            toolCalls: expect.arrayContaining([expect.objectContaining({ id: 'call-1' })]),
          }),
        }),
      }),
    );
    expect(rounds[1]).toEqual(
      expect.objectContaining({
        context: expect.objectContaining({
          response: { role: 'assistant', content: '完成回答' },
        }),
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool.completed', toolCallId: 'call-1' }),
        expect.objectContaining({ type: 'text.delta', delta: '完成回答', roundSequence: 2 }),
      ]),
    );
  });

  it('budgets Tool Results against the compiled round instead of the uncompressed transcript', async () => {
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'call-after-compaction',
              name: AGENT_TOOL_NAMES.webSearch,
              arguments: '{"query":"latest market"}',
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '已使用完整搜索结果回答。' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const compiledMessages = [
      { role: 'system' as const, content: 'test' },
      {
        role: 'system' as const,
        content: '<compaction_summary>older history</compaction_summary>',
      },
      { role: 'user' as const, content: 'hello' },
    ];
    const compactionState = {
      summary: 'older history',
      coveredMessageCount: 20,
      coveredThroughItemId: null,
      version: 2,
      tokenCount: 10,
    };
    const trimToolResults = vi.fn(
      async (
        _messages: ModelRoundInput['messages'],
        _definitions: unknown,
        candidates: Array<{ toolCallId: string; toolName: string; content: string }>,
      ) =>
        candidates.map((candidate) => ({
          ...candidate,
          originalTokens: 100,
          retainedTokens: 100,
          truncated: false,
        })),
    );
    const compileRound = vi
      .fn()
      .mockResolvedValueOnce({
        messages: compiledMessages,
        estimatedInputTokens: 43_000,
        promptBudget: 116_326,
        compactionTriggered: true,
        compactionState,
      })
      .mockImplementation(async (input: { messages: ModelRoundInput['messages'] }) => ({
        messages: input.messages,
        estimatedInputTokens: 45_000,
        promptBudget: 116_326,
        compactionTriggered: false,
      }));
    const context = {
      compileRound,
      trimToolResults,
    } as unknown as ContextEngineeringService;

    await collect(new AgentRuntimeService(model, registry(), logger(), context));

    const budgetMessages = trimToolResults.mock.calls[0]![0];
    expect(budgetMessages.slice(0, compiledMessages.length)).toEqual(compiledMessages);
    expect(budgetMessages).toHaveLength(compiledMessages.length + 1);
    expect(budgetMessages.at(-1)).toMatchObject({
      role: 'assistant',
      toolCalls: [expect.objectContaining({ id: 'call-after-compaction' })],
    });
    expect(compileRound.mock.calls[1]![0]).toMatchObject({ compactionState });
  });

  it('returns structured failure to the model and lets the model continue', async () => {
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'call-failed',
              name: AGENT_TOOL_NAMES.webSearch,
              arguments: '{"query":"market"}',
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '当前无法联网，我先受限回答。' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({
      execute: vi.fn().mockResolvedValue({
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.searchProviderFailed,
          detail: '搜索服务暂时不可用。',
          retryable: true,
          cause: new Error('secret upstream detail'),
        },
        logFields: { Provider: 'test' },
      }),
    });
    const events = await collect(new AgentRuntimeService(model, tools, logger()));
    const secondInput = model.streamRound.mock.calls[1]![0] as ModelRoundInput;

    const toolMessage = secondInput.messages.findLast((message) => message.role === 'tool');
    expect(toolMessage).toMatchObject({
      role: 'tool',
      toolCallId: 'call-failed',
      content: JSON.stringify({
        ok: false,
        error: {
          code: AGENT_ERROR_CODES.searchProviderFailed,
          detail: '搜索服务暂时不可用。',
          retryable: true,
        },
      }),
    });
    expect(toolMessage?.content).not.toContain('secret upstream detail');
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool.failed',
          code: AGENT_ERROR_CODES.searchProviderFailed,
          retryable: true,
        }),
        expect.objectContaining({
          type: 'text.delta',
          delta: '当前无法联网，我先受限回答。',
          roundSequence: 2,
        }),
      ]),
    );
  });

  it('converts an unhandled tool exception into a retryable failure', async () => {
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [{ id: 'call-error', name: 'custom_tool', arguments: '{}' }],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '已改用已有信息。' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({ execute: vi.fn().mockRejectedValue(new Error('boom')) });
    const events = await collect(new AgentRuntimeService(model, tools, logger()));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool.failed',
          code: AGENT_ERROR_CODES.toolUnavailable,
          retryable: true,
        }),
      ]),
    );
  });

  it('enforces the tool outer timeout and allows the next model round to answer', async () => {
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            { id: 'call-timeout', name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"x"}' },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '工具超时，给出受限回答。' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({
      executionPolicy: vi.fn(() => ({ timeoutMs: 1 })),
      execute: vi.fn(() => new Promise(() => undefined)) as ToolRegistryService['execute'],
    });
    const events = await collect(new AgentRuntimeService(model, tools, logger()));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool.failed',
          code: AGENT_ERROR_CODES.toolTimeout,
          retryable: true,
        }),
      ]),
    );
  });

  it('publishes cancellation and terminates without another model round', async () => {
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            { id: 'call-cancel', name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"x"}' },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
    ]);
    const controller = new AbortController();
    const tools = registry({
      execute: vi.fn(
        (_name, _input, context) =>
          new Promise((_resolve, reject) => {
            context.signal?.addEventListener('abort', () => reject(new Error('cancelled')), {
              once: true,
            });
          }),
      ) as ToolRegistryService['execute'],
    });
    setTimeout(() => controller.abort(), 1);
    const events: unknown[] = [];
    await expect(
      (async () => {
        for await (const event of new AgentRuntimeService(model, tools, logger()).run({
          sessionId: 'session-1',
          messageId: 'message-1',
          model: 'test-model',
          systemPrompt: 'test',
          messages: [{ role: 'user', content: 'hello' }],
          signal: controller.signal,
        }))
          events.push(event);
      })(),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool.cancelled', toolCallId: 'call-cancel' }),
      ]),
    );
    expect(model.streamRound).toHaveBeenCalledOnce();
  });

  it('executes multiple calls from one assistant response in model order', async () => {
    const calls = [
      { id: 'call-1', name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"x"}' },
      {
        id: 'call-2',
        name: AGENT_TOOL_NAMES.webFetch,
        arguments: '{"urls":["https://example.com"]}',
      },
    ];
    const model = modelFromRounds([
      [
        { type: 'tool_calls.completed', calls },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '完成' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const order: string[] = [];
    const tools = registry({
      execute: vi.fn(async (name: string) => {
        order.push(name);
        return { status: 'succeeded' as const, output: { name } };
      }) as ToolRegistryService['execute'],
    });
    await collect(new AgentRuntimeService(model, tools, logger()));
    expect(order).toEqual([AGENT_TOOL_NAMES.webSearch, AGENT_TOOL_NAMES.webFetch]);
  });

  it('counts every declared call, skips the 21st, then requires a tool-free answer', async () => {
    const calls = Array.from({ length: 21 }, (_, index) => ({
      id: `call-${index + 1}`,
      name: AGENT_TOOL_NAMES.webSearch,
      arguments: '{"query":"x"}',
    }));
    const model = modelFromRounds([
      [
        { type: 'tool_calls.completed', calls },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '达到调用上限后的最终回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry();
    const events = await collect(new AgentRuntimeService(model, tools, logger()));

    expect(tools.execute).toHaveBeenCalledTimes(20);
    expect(events.filter((event) => event.type === 'tool.started')).toHaveLength(20);
    expect(events.at(-1)).toEqual({
      type: 'run.completed',
      content: '达到调用上限后的最终回答',
      toolCallCount: 20,
    });
    const finalInput = model.streamRound.mock.calls[1]![0] as ModelRoundInput;
    expect(finalInput.tools).toBeUndefined();
    expect(
      finalInput.messages.find(
        (message) => message.role === 'tool' && message.toolCallId === 'call-21',
      )?.content,
    ).toContain(AGENT_ERROR_CODES.toolCallLimitExceeded);
  });

  it('counts success, failure, invalid arguments, and unknown tools toward one shared limit', async () => {
    const calls = [
      {
        id: 'call-success',
        name: AGENT_TOOL_NAMES.webSearch,
        arguments: '{"query":"ok"}',
      },
      {
        id: 'call-invalid',
        name: AGENT_TOOL_NAMES.webSearch,
        arguments: '{invalid-json',
      },
      { id: 'call-unknown', name: 'unknown_tool', arguments: '{}' },
      {
        id: 'call-failed',
        name: AGENT_TOOL_NAMES.webSearch,
        arguments: '{"query":"fail"}',
      },
      ...Array.from({ length: 17 }, (_, index) => ({
        id: `call-extra-${index + 1}`,
        name: AGENT_TOOL_NAMES.webSearch,
        arguments: '{"query":"ok"}',
      })),
    ];
    const model = modelFromRounds([
      [
        { type: 'tool_calls.completed', calls },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '混合调用达到上限后的回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({
      parseInput: vi.fn((name: string, raw: string) => {
        if (name === 'unknown_tool') throw new Error(AGENT_ERROR_CODES.unknownTool);
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          throw new Error(AGENT_ERROR_CODES.invalidToolArguments);
        }
      }),
      execute: vi.fn(async (_name: string, input: unknown) =>
        (input as { query?: string }).query === 'fail'
          ? {
              status: 'failed' as const,
              error: {
                code: AGENT_ERROR_CODES.searchProviderFailed,
                detail: '搜索失败。',
                retryable: true,
              },
            }
          : { status: 'succeeded' as const, output: { ok: true } },
      ) as ToolRegistryService['execute'],
    });
    const events = await collect(new AgentRuntimeService(model, tools, logger()));
    const finalInput = model.streamRound.mock.calls[1]![0] as ModelRoundInput;
    const toolMessages = finalInput.messages.filter((message) => message.role === 'tool');

    expect(tools.execute).toHaveBeenCalledTimes(18);
    expect(events.filter((event) => event.type === 'tool.started')).toHaveLength(18);
    expect(events.at(-1)).toEqual({
      type: 'run.completed',
      content: '混合调用达到上限后的回答',
      toolCallCount: 20,
    });
    expect(toolMessages).toHaveLength(21);
    expect(
      toolMessages.find((message) => message.toolCallId === 'call-invalid')?.content,
    ).toContain(AGENT_ERROR_CODES.invalidToolArguments);
    expect(
      toolMessages.find((message) => message.toolCallId === 'call-unknown')?.content,
    ).toContain(AGENT_ERROR_CODES.unknownTool);
    expect(
      toolMessages.find((message) => message.toolCallId === 'call-extra-17')?.content,
    ).toContain(AGENT_ERROR_CODES.toolCallLimitExceeded);
  });
});
