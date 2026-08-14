import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { AGENT_ERROR_CODES, AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import { AgentRuntimeService } from '../../../src/agent-runtime/agent-runtime.service';
import type { ModelAdapter, ModelRoundInput } from '../../../src/model/model-adapter';
import type { ToolRegistryService } from '../../../src/tools/tool-registry.service';

type RoundEvent =
  | { type: 'text.delta'; delta: string }
  | { type: 'reasoning.delta'; delta: string }
  | {
      type: 'tool_calls.completed';
      calls: Array<{ id: string; name: string; arguments: string }>;
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
async function collect(runtime: AgentRuntimeService, signal?: AbortSignal) {
  const events = [];
  for await (const event of runtime.run({
    sessionId: 'session-1',
    messageId: 'message-1',
    model: 'test-model',
    systemPrompt: 'test',
    messages: [{ role: 'user', content: 'hello' }],
    signal,
  }))
    events.push(event);
  return events;
}

// 返回不输出控制台内容的 Logger 替身。
function logger(): Logger {
  return { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
}

describe('AgentRuntimeService model-led tool boundary', () => {
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
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool.completed', toolCallId: 'call-1' }),
        expect.objectContaining({ type: 'text.delta', delta: '完成回答', roundSequence: 2 }),
      ]),
    );
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
