import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { AGENT_ERROR_CODES, AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import { AgentRuntimeService } from '../../../src/agent-runtime/agent-runtime.service';
import { BashCommandPolicyService } from '../../../src/sandbox/bash-command-policy.service';
import type { ContextEngineeringService } from '../../../src/context-engineering/context-engineering.service';
import type { ModelAdapter, ModelRoundInput } from '../../../src/model/model-adapter';
import type { ToolRegistryService } from '../../../src/tools/tool-registry.service';
import {
  RuntimeLifecycleController,
  type RuntimeLifecycleEvent,
  type RuntimeLifecycleHook,
} from '../../../src/agent-runtime/runtime-lifecycle';

type RoundEvent =
  | {
      type: 'text.delta';
      delta: string;
      blockSequence?: number;
      phase?: 'commentary' | 'final_answer' | null;
    }
  | { type: 'reasoning.delta'; delta: string }
  | {
      type: 'tool_calls.completed';
      calls: Array<{ id: string; name: string; arguments: string }>;
    }
  | {
      type: 'clarification.completed';
      request: { question: string; options: string[]; allowFreeText: boolean };
    }
  | {
      type: 'round.completed';
      finishReason: string | null;
      incompleteReason?: string;
      usage?: {
        promptTokens: number | null;
        completionTokens: number | null;
        cachedTokens: number | null;
        estimatedPromptTokens: number;
      };
    };

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
    approvalPolicy: vi.fn(() => 'auto_execute' as const),
    execute: vi.fn().mockResolvedValue({ status: 'succeeded', output: { value: 'ok' } }),
    resolveName: vi.fn((name: string) => name),
    ...overrides,
  } as unknown as ToolRegistryService & { execute: ReturnType<typeof vi.fn> };
}

// 收集 Runtime 事件直到 run.completed 或异常。
async function collect(
  runtime: AgentRuntimeService,
  signal?: AbortSignal,
  lifecycle?: RuntimeLifecycleController,
  reasoningEffort?: ModelRoundInput['reasoningEffort'],
) {
  const events = [];
  for await (const event of runtime.run({
    userId: 'local-user',
    sessionId: 'session-1',
    messageId: 'message-1',
    model: 'test-model',
    systemPrompt: 'test',
    messages: [{ role: 'user', content: 'hello' }],
    signal,
    lifecycle,
    ...(reasoningEffort ? { reasoningEffort } : {}),
  }))
    events.push(event);
  return events;
}

// 返回不输出控制台内容的 Logger 替身。
function logger(): Logger {
  return { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
}

describe('AgentRuntimeService model-led tool boundary', () => {
  it('propagates Responses phases through tool commentary and the final answer', async () => {
    const model = modelFromRounds([
      [
        {
          type: 'text.delta',
          delta: '我先查询。',
          blockSequence: 1,
          phase: 'commentary',
        },
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'call-1',
              name: AGENT_TOOL_NAMES.webSearch,
              arguments: '{"query":"weather"}',
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        {
          type: 'text.delta',
          delta: '最终回答。',
          blockSequence: 1,
          phase: 'final_answer',
        },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);

    const events = await collect(
      new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger()),
      undefined,
      undefined,
      'high',
    );
    expect(events.filter((event) => event.type === 'text.delta')).toEqual([
      expect.objectContaining({ delta: '我先查询。', phase: 'commentary' }),
      expect.objectContaining({ delta: '最终回答。', phase: 'final_answer' }),
    ]);
    expect(
      events.filter(
        (event) => event.type === 'transcript.item' && event.message.role === 'assistant',
      ),
    ).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({ phase: 'commentary', toolCalls: expect.any(Array) }),
      }),
      expect.objectContaining({
        message: expect.objectContaining({ phase: 'final_answer', content: '最终回答。' }),
      }),
    ]);
  });

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
      new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger()),
      undefined,
      lifecycle,
    );
    await vi.waitFor(() =>
      expect(lifecycle.snapshot().activeInterrupt?.kind).toBe('clarification'),
    );
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

  it('auto-boosts bash network without tool approval', async () => {
    const bashInput = {
      command: 'curl -fsS https://example.com/doc',
      description: 'fetch doc',
    };
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'bash-network',
              name: AGENT_TOOL_NAMES.bash,
              arguments: JSON.stringify(bashInput),
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '完成' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({
      resolveName: vi.fn((name: string) =>
        name === AGENT_TOOL_NAMES.bash ? AGENT_TOOL_NAMES.bash : name,
      ),
      parseInput: vi.fn((_name: string, raw: string) => JSON.parse(raw)),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: {
          exitCode: 0,
          stdout: 'ok',
          stderr: '',
          timedOut: false,
          aborted: false,
          timeoutMs: 120_000,
          durationMs: 1,
        },
      }),
    });
    const lifecycle = new RuntimeLifecycleController('run-bash-network');
    const execution = collect(
      new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()),
      undefined,
      lifecycle,
    );
    await vi.waitFor(() => expect(tools.execute).toHaveBeenCalled());
    expect(lifecycle.snapshot().activeInterrupt).toBeUndefined();
    await execution;
    expect(tools.execute).toHaveBeenCalledWith(
      AGENT_TOOL_NAMES.bash,
      bashInput,
      expect.objectContaining({ bashEgressBoost: true }),
      expect.objectContaining({ userId: 'local-user' }),
    );
  });

  it('requires approval for bash install before egress boost', async () => {
    const bashInput = {
      command: 'pip install requests',
      description: 'install deps',
    };
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'bash-install',
              name: AGENT_TOOL_NAMES.bash,
              arguments: JSON.stringify(bashInput),
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '完成' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({
      resolveName: vi.fn((name: string) =>
        name === AGENT_TOOL_NAMES.bash ? AGENT_TOOL_NAMES.bash : name,
      ),
      parseInput: vi.fn((_name: string, raw: string) => JSON.parse(raw)),
      execute: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: {
          exitCode: 0,
          stdout: 'installed',
          stderr: '',
          timedOut: false,
          aborted: false,
          timeoutMs: 120_000,
          durationMs: 1,
        },
      }),
    });
    const lifecycle = new RuntimeLifecycleController('run-bash-install');
    const execution = collect(
      new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()),
      undefined,
      lifecycle,
    );
    await vi.waitFor(() =>
      expect(lifecycle.snapshot().activeInterrupt?.kind).toBe('tool_approval'),
    );
    expect(tools.execute).not.toHaveBeenCalled();
    const interrupt = lifecycle.snapshot().activeInterrupt!;
    if (interrupt.kind !== 'tool_approval') throw new Error('expected tool approval');
    const item = interrupt.payload.items[0]!;
    lifecycle.decideApproval(interrupt.interruptId, [
      {
        itemId: item.itemId,
        toolCallId: item.toolCallId,
        argumentsHash: item.argumentsHash,
        decision: 'approve',
      },
    ]);
    await execution;
    expect(tools.execute).toHaveBeenCalledWith(
      AGENT_TOOL_NAMES.bash,
      bashInput,
      expect.objectContaining({ bashEgressBoost: true }),
      expect.objectContaining({ userId: 'local-user' }),
    );
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
        new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()),
        undefined,
        lifecycle,
      );
      await vi.waitFor(() =>
        expect(lifecycle.snapshot().activeInterrupt?.kind).toBe('tool_approval'),
      );
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

    await collect(new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger()), undefined, lifecycle);

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
      new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger()),
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
      new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()),
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

    const events = await collect(
      new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger()),
      undefined,
      undefined,
      'high',
    );

    expect(events.some((event) => (event as { type: string }).type === 'reasoning.delta')).toBe(
      true,
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

  it('switches one reasoning-only round to a tool-free finalization recovery', async () => {
    const model = modelFromRounds([
      [
        { type: 'reasoning.delta', delta: '第一段思考' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
      [
        { type: 'text.delta', delta: '最终回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);

    const events = await collect(
      new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger()),
      undefined,
      undefined,
      'high',
    );

    expect(model.streamRound).toHaveBeenCalledTimes(2);
    expect(model.streamRound.mock.calls[0]?.[0]).toMatchObject({
      reasoningEffort: 'high',
      maxOutputTokens: 32_768,
      allowClarification: true,
    });
    expect(model.streamRound.mock.calls[0]?.[0].tools).toBeDefined();
    expect(model.streamRound.mock.calls[1]?.[0]).toMatchObject({
      reasoningEffort: 'off',
      maxOutputTokens: 32_768,
      allowClarification: false,
    });
    expect(model.streamRound.mock.calls[1]?.[0].tools).toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'transcript.item',
        message: expect.objectContaining({ content: '最终回答' }),
      }),
    );
  });

  it('fails after one finalization recovery also returns reasoning only', async () => {
    const model = modelFromRounds([
      [
        { type: 'reasoning.delta', delta: '第一段思考' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
      [
        { type: 'reasoning.delta', delta: '第二段思考' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);

    await expect(collect(new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger()))).rejects.toMatchObject(
      { response: { code: AGENT_ERROR_CODES.modelReasoningOnly } },
    );
    expect(model.streamRound).toHaveBeenCalledTimes(2);
  });

  it('retries a truncated reasoning-only round instead of treating it as reasoning-only', async () => {
    const model = modelFromRounds([
      [
        { type: 'reasoning.delta', delta: '未完成推理' },
        {
          type: 'round.completed',
          finishReason: 'max_output_tokens',
          incompleteReason: 'max_output_tokens',
        },
      ],
      [
        { type: 'text.delta', delta: '这是缩短后的完整回答。' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);

    const events = await collect(new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger()));
    expect(model.streamRound).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'transcript.item',
        message: expect.objectContaining({ content: '这是缩短后的完整回答。' }),
      }),
    );
  });

  it('fails after output-limit recovery is also truncated', async () => {
    const model = modelFromRounds([
      [
        { type: 'reasoning.delta', delta: '未完成推理' },
        {
          type: 'round.completed',
          finishReason: 'max_output_tokens',
          incompleteReason: 'max_output_tokens',
        },
      ],
      [
        { type: 'reasoning.delta', delta: '仍然超长' },
        {
          type: 'round.completed',
          finishReason: 'max_output_tokens',
          incompleteReason: 'max_output_tokens',
        },
      ],
    ]);

    await expect(collect(new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger()))).rejects.toMatchObject(
      { response: { code: AGENT_ERROR_CODES.modelOutputLimit } },
    );
    expect(model.streamRound).toHaveBeenCalledTimes(2);
  });

  it('executes a truncated round when tool arguments are still complete JSON', async () => {
    const tools = registry();
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'call-1',
              name: AGENT_TOOL_NAMES.webSearch,
              arguments: '{"query":"weather"}',
            },
          ],
        },
        {
          type: 'round.completed',
          finishReason: 'max_output_tokens',
          incompleteReason: 'max_output_tokens',
        },
      ],
      [
        { type: 'text.delta', delta: '天气晴朗。' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);

    const events = await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));
    expect(tools.execute).toHaveBeenCalledWith(
      AGENT_TOOL_NAMES.webSearch,
      { query: 'weather' },
      expect.anything(),
      expect.objectContaining({ mcpSnapshot: undefined }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'transcript.item',
        message: expect.objectContaining({ content: '天气晴朗。' }),
      }),
    );
  });

  it('salvages a truncated create_report payload and continues the run', async () => {
    const tools = registry();
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'call-report',
              name: AGENT_TOOL_NAMES.createReport,
              arguments:
                '{"title":"走势复盘","summary":"摘要","fileName":"report.md","content":"# 结论\\n\\n短期偏强',
            },
          ],
        },
        {
          type: 'round.completed',
          finishReason: 'max_output_tokens',
          incompleteReason: 'max_output_tokens',
        },
      ],
      [
        { type: 'text.delta', delta: '报告已生成。' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);

    const events = await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));
    expect(tools.parseInput).toHaveBeenCalledWith(
      AGENT_TOOL_NAMES.createReport,
      expect.stringContaining('"title":"走势复盘"'),
      expect.objectContaining({ mcpSnapshot: undefined }),
    );
    expect(JSON.parse(String(vi.mocked(tools.parseInput).mock.calls[0]?.[1]))).toMatchObject({
      title: '走势复盘',
      fileName: 'report.md',
      content: expect.stringContaining('# 结论'),
    });
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'transcript.item',
        message: expect.objectContaining({ content: '报告已生成。' }),
      }),
    );
  });

  it('retries an unusable truncated tool call instead of failing the run', async () => {
    const tools = registry();
    const model = modelFromRounds([
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'call-1',
              name: AGENT_TOOL_NAMES.webSearch,
              arguments: '{"query":"未完成',
            },
          ],
        },
        {
          type: 'round.completed',
          finishReason: 'max_output_tokens',
          incompleteReason: 'max_output_tokens',
        },
      ],
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'call-2',
              name: AGENT_TOOL_NAMES.webSearch,
              arguments: '{"query":"weather"}',
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '已完成。' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);

    const events = await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'transcript.item',
        message: expect.objectContaining({ content: '已完成。' }),
      }),
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
    const events = await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));

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
        promptBudget: 566_000,
        compactionTriggered: true,
        compactionState,
      })
      .mockImplementation(async (input: { messages: ModelRoundInput['messages'] }) => ({
        messages: input.messages,
        estimatedInputTokens: 45_000,
        promptBudget: 566_000,
        compactionTriggered: false,
      }));
    const context = {
      compileRound,
      trimToolResults,
      applyCollapsedToolPointers: vi.fn(),
    } as unknown as ContextEngineeringService;

    await collect(new AgentRuntimeService(model, registry(), new BashCommandPolicyService(), logger(), context));

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
    const events = await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));
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
    const events = await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));
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
    const events = await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));
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
        for await (const event of new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()).run({
          userId: 'local-user',
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
    await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));
    expect(order).toEqual([AGENT_TOOL_NAMES.webSearch, AGENT_TOOL_NAMES.webFetch]);
  });

  it('executes every call in one batch and counts a single investigation turn', async () => {
    const calls = Array.from({ length: 41 }, (_, index) => ({
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
        { type: 'text.delta', delta: '同轮多 call 后的最终回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry();
    const events = await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));

    expect(tools.execute).toHaveBeenCalledTimes(41);
    expect(events.filter((event) => event.type === 'tool.started')).toHaveLength(41);
    expect(events.at(-1)).toEqual({
      type: 'run.completed',
      content: '同轮多 call 后的最终回答',
      toolCallCount: 41,
    });
    const secondRoundInput = model.streamRound.mock.calls[1]![0] as ModelRoundInput;
    expect(secondRoundInput.tools?.map((tool) => tool.name)).toContain(AGENT_TOOL_NAMES.webSearch);
  });

  it('enters delivery after 40 investigation turns and allows create_report only', async () => {
    const investigationRounds = Array.from({ length: 40 }, (_, index) => [
      {
        type: 'tool_calls.completed' as const,
        calls: [
          {
            id: `call-${index + 1}`,
            name: AGENT_TOOL_NAMES.webSearch,
            arguments: '{"query":"x"}',
          },
        ],
      },
      { type: 'round.completed' as const, finishReason: 'tool_calls' },
    ]);
    const model = modelFromRounds([
      ...investigationRounds,
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'delivery-call',
              name: AGENT_TOOL_NAMES.createReport,
              arguments: '{"title":"t","content":"body"}',
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '交付完成' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({
      definitions: vi.fn(() => [
        { name: AGENT_TOOL_NAMES.webSearch, description: '搜索网页', parameters: {} },
        { name: AGENT_TOOL_NAMES.createReport, description: '写报告', parameters: {} },
      ]),
    });
    await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));

    const deliveryRoundInput = model.streamRound.mock.calls[40]![0] as ModelRoundInput;
    expect(deliveryRoundInput.tools?.map((tool) => tool.name).sort()).toEqual(
      [AGENT_TOOL_NAMES.createReport, AGENT_TOOL_NAMES.updatePlan].sort(),
    );
    expect(
      deliveryRoundInput.messages.some(
        (message) => message.role === 'system' && message.content.includes('交付阶段'),
      ),
    ).toBe(true);
  });

  it('rejects read_file in delivery phase with TOOL_PHASE_RESTRICTED', async () => {
    const investigationRounds = Array.from({ length: 40 }, (_, index) => [
      {
        type: 'tool_calls.completed' as const,
        calls: [
          {
            id: `call-${index + 1}`,
            name: AGENT_TOOL_NAMES.webSearch,
            arguments: '{"query":"x"}',
          },
        ],
      },
      { type: 'round.completed' as const, finishReason: 'tool_calls' },
    ]);
    const model = modelFromRounds([
      ...investigationRounds,
      [
        {
          type: 'tool_calls.completed',
          calls: [
            {
              id: 'read-delivery',
              name: AGENT_TOOL_NAMES.readFile,
              arguments: '{"path":"a.txt","scope":"file"}',
            },
          ],
        },
        { type: 'round.completed', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', delta: '最终回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({
      definitions: vi.fn(() => [
        { name: AGENT_TOOL_NAMES.webSearch, description: '搜索网页', parameters: {} },
        { name: AGENT_TOOL_NAMES.readFile, description: '读文件', parameters: {} },
      ]),
      parseInput: vi.fn((name: string, raw: string) => JSON.parse(raw)),
    });
    await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));

    const deliveryRoundInput = model.streamRound.mock.calls[40]![0] as ModelRoundInput;
    expect(
      deliveryRoundInput.messages.find(
        (message) => message.role === 'tool' && message.toolCallId === 'read-delivery',
      )?.content,
    ).toContain(AGENT_ERROR_CODES.toolPhaseRestricted);
    expect(tools.execute).not.toHaveBeenCalledWith(
      AGENT_TOOL_NAMES.readFile,
      expect.anything(),
      expect.anything(),
    );
  });

  it('enters final_only after delivery turns are exhausted without counting the final text round', async () => {
    const investigationRounds = Array.from({ length: 40 }, (_, index) => [
      {
        type: 'tool_calls.completed' as const,
        calls: [
          {
            id: `inv-${index + 1}`,
            name: AGENT_TOOL_NAMES.webSearch,
            arguments: '{"query":"x"}',
          },
        ],
      },
      { type: 'round.completed' as const, finishReason: 'tool_calls' },
    ]);
    const deliveryRounds = Array.from({ length: 3 }, (_, index) => [
      {
        type: 'tool_calls.completed' as const,
        calls: [
          {
            id: `del-${index + 1}`,
            name: AGENT_TOOL_NAMES.createReport,
            arguments: '{"title":"t","content":"c"}',
          },
        ],
      },
      { type: 'round.completed' as const, finishReason: 'tool_calls' },
    ]);
    const model = modelFromRounds([
      ...investigationRounds,
      ...deliveryRounds,
      [
        { type: 'text.delta', delta: '无工具最终回答' },
        { type: 'round.completed', finishReason: 'stop' },
      ],
    ]);
    const tools = registry({
      definitions: vi.fn(() => [
        { name: AGENT_TOOL_NAMES.webSearch, description: '搜索网页', parameters: {} },
        { name: AGENT_TOOL_NAMES.createReport, description: '写报告', parameters: {} },
      ]),
    });
    await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));

    const finalRoundInput = model.streamRound.mock.calls[43]![0] as ModelRoundInput;
    expect(finalRoundInput.tools).toBeUndefined();
    expect(finalRoundInput.messages.some((message) => message.role === 'tool')).toBe(true);
  });

  it('dispatches mixed outcomes in one batch without per-call turn cap', async () => {
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
      ...Array.from({ length: 37 }, (_, index) => ({
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
        { type: 'text.delta', delta: '混合调用后的回答' },
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
    const events = await collect(new AgentRuntimeService(model, tools, new BashCommandPolicyService(), logger()));
    const secondRoundInput = model.streamRound.mock.calls[1]![0] as ModelRoundInput;
    const toolMessages = secondRoundInput.messages.filter((message) => message.role === 'tool');

    expect(tools.execute).toHaveBeenCalledTimes(39);
    expect(events.filter((event) => event.type === 'tool.started')).toHaveLength(39);
    expect(events.at(-1)).toEqual({
      type: 'run.completed',
      content: '混合调用后的回答',
      toolCallCount: 41,
    });
    expect(toolMessages).toHaveLength(41);
    expect(
      toolMessages.find((message) => message.toolCallId === 'call-invalid')?.content,
    ).toContain(AGENT_ERROR_CODES.invalidToolArguments);
    expect(
      toolMessages.find((message) => message.toolCallId === 'call-unknown')?.content,
    ).toContain(AGENT_ERROR_CODES.unknownTool);
    expect(
      toolMessages.find((message) => message.toolCallId === 'call-extra-37')?.content,
    ).not.toContain(AGENT_ERROR_CODES.toolCallLimitExceeded);
  });
});
