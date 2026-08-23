import { describe, expect, it, vi } from 'vitest';
import { getDeepSeekV3TokenEstimator } from '@harness/deepseek-v3-tokenizer';
import { ContextEngineeringService } from '../../../src/context-engineering/context-engineering.service';
import type { ModelAdapter } from '../../../src/model/model-adapter';

function variedChinese(length: number): string {
  return Array.from({ length }, (_, index) => String.fromCodePoint(0x4e00 + (index % 2_000))).join(
    '',
  );
}

function createService(overrides: { state?: unknown; summary?: string } = {}) {
  const prisma = {
    contextCompactionState: {
      findUnique: vi.fn().mockResolvedValue(overrides.state ?? null),
    },
  };
  const model = {
    generateText: vi.fn().mockResolvedValue(overrides.summary ?? 'summary of completed work'),
  };
  return {
    service: new ContextEngineeringService(prisma as never, model as unknown as ModelAdapter),
    prisma,
    model,
  };
}

describe('ContextEngineeringService', () => {
  it('allocates a shared Tool Result budget and trims oversized results', async () => {
    const { service } = createService();
    const result = await service.trimToolResults(
      [{ role: 'system', content: 'system' }],
      undefined,
      [
        { toolCallId: 'one', toolName: 'search', content: '甲'.repeat(70_000) },
        { toolCallId: 'two', toolName: 'search', content: '乙'.repeat(70_000) },
      ],
      'deepseek-v4-flash',
    );
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.truncated)).toBe(true);
    expect(result.every((item) => item.content).toString()).not.toBe('');
    expect(result.every((item) => item.retainedTokens < item.originalTokens)).toBe(true);
  }, 15_000);

  it('retains substantive Tool Results when a compiled round still has ample budget', async () => {
    const { service } = createService();
    const result = await service.trimToolResults(
      [
        { role: 'system', content: 'system' },
        { role: 'system', content: '<compaction_summary>历史摘要</compaction_summary>' },
        { role: 'user', content: '甲'.repeat(43_000) },
      ],
      undefined,
      [
        { toolCallId: 'one', toolName: 'search', content: '搜索结果一'.repeat(1_000) },
        { toolCallId: 'two', toolName: 'search', content: '搜索结果二'.repeat(700) },
      ],
      'deepseek-v4-flash',
    );

    expect(result.every((item) => item.truncated === false)).toBe(true);
    expect(result.every((item) => item.retainedTokens === item.originalTokens)).toBe(true);
    expect(result.every((item) => item.content.includes('搜索结果'))).toBe(true);
  }, 15_000);

  it('compacts a closed historical prefix and persists the coverage boundary', async () => {
    const { service, model } = createService();
    const largeHistory = variedChinese(100_000);
    const messages = [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: largeHistory },
      ...Array.from({ length: 11 }, (_, index) => ({
        role: 'user' as const,
        content: `最近消息 ${index}`,
      })),
      { role: 'user' as const, content: '当前请求' },
    ];
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-v4-flash',
      messages,
    });
    expect(compiled.compactionTriggered).toBe(true);
    expect(model.generateText).toHaveBeenCalled();
    expect(compiled.compactionState).toEqual(
      expect.objectContaining({ summary: 'summary of completed work' }),
    );
    expect(
      compiled.messages.some(
        (message) => message.role === 'system' && message.content.includes('compaction_summary'),
      ),
    ).toBe(true);
  }, 15_000);

  it('returns compaction state in memory and reuses it in the next round', async () => {
    const { service, prisma } = createService();
    const first = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: variedChinese(100_000) },
        ...Array.from({ length: 12 }, (_, index) => ({
          role: 'user' as const,
          content: `最近消息 ${index}`,
        })),
      ],
    });

    expect(first.compactionState).toBeDefined();
    await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: '下一轮' },
      ],
      compactionState: first.compactionState,
    });
    expect(prisma.contextCompactionState.findUnique).toHaveBeenCalledOnce();
  });

  it('propagates run cancellation without retrying or advancing compaction state', async () => {
    const controller = new AbortController();
    const { service, model } = createService();
    vi.mocked(model.generateText).mockImplementationOnce(async (_model, _messages, signal) => {
      controller.abort();
      expect(signal?.aborted).toBe(true);
      throw new Error('cancelled');
    });

    await expect(
      service.compileRound({
        sessionId: 'session-1',
        model: 'deepseek-v4-flash',
        signal: controller.signal,
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: variedChinese(100_000) },
          ...Array.from({ length: 12 }, (_, index) => ({
            role: 'user' as const,
            content: `最近消息 ${index}`,
          })),
        ],
      }),
    ).rejects.toThrow('cancelled');
    expect(model.generateText).toHaveBeenCalledOnce();
  });

  it('splits oversized closed history into budgeted summaries without separating a Tool unit', async () => {
    const { service, model } = createService({ summary: 'bounded summary' });
    const toolPayload = variedChinese(70_000);
    await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: 'system' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-1',
              name: 'web_search',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        { role: 'tool', toolCallId: 'call-1', content: toolPayload },
        { role: 'user', content: variedChinese(70_000) },
        ...Array.from({ length: 12 }, (_, index) => ({
          role: 'user' as const,
          content: `最近消息 ${index}`,
        })),
      ],
    });

    expect(model.generateText.mock.calls.length).toBeGreaterThan(1);
    const estimator = getDeepSeekV3TokenEstimator();
    const promptBudget = 131_072 - 8_192 - Math.ceil(131_072 * 0.05);
    for (const [, messages] of model.generateText.mock.calls) {
      expect(await estimator.countMessages(messages as never)).toBeLessThanOrEqual(promptBudget);
    }
    const toolUnitPrompt = model.generateText.mock.calls
      .map(([, messages]) => JSON.stringify(messages))
      .find((payload) => payload.includes('call-1'));
    expect(toolUnitPrompt).toContain(toolPayload.slice(0, 100));
  }, 20_000);

  it('does not advance compaction state when a summary batch and its retry both fail', async () => {
    const { service, model } = createService();
    model.generateText.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.compileRound({
        sessionId: 'session-1',
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: variedChinese(100_000) },
          ...Array.from({ length: 12 }, (_, index) => ({
            role: 'user' as const,
            content: `最近消息 ${index}`,
          })),
        ],
      }),
    ).rejects.toThrow('CONTEXT_BUDGET_EXCEEDED');
    expect(model.generateText).toHaveBeenCalledTimes(2);
  });
});
