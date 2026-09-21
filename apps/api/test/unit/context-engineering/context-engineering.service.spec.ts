import { describe, expect, it, vi } from 'vitest';
import { getDeepSeekV3TokenEstimator } from '@harness/deepseek-v3-tokenizer';
import { ContextEngineeringService } from '../../../src/context-engineering/context-engineering.service';
import type { ModelAdapter } from '../../../src/model/model-adapter';

function variedChinese(length: number): string {
  return Array.from({ length }, (_, index) => String.fromCodePoint(0x4e00 + (index % 2_000))).join(
    '',
  );
}

function createService(
  overrides: {
    state?: unknown;
    summary?: string;
    files?: { createToolResultFile: ReturnType<typeof vi.fn> };
  } = {},
) {
  const prisma = {
    contextCompactionState: {
      findUnique: vi.fn().mockResolvedValue(overrides.state ?? null),
    },
  };
  const model = {
    generateText: vi.fn().mockResolvedValue(overrides.summary ?? 'summary of completed work'),
  };
  const files = overrides.files ?? {
    createToolResultFile: vi.fn().mockImplementation(async (input: { toolCallId: string }) => {
      const suffix = input.toolCallId
        .replace(/[^a-f0-9]/gi, 'a')
        .toLowerCase()
        .padEnd(12, 'a')
        .slice(0, 12);
      return {
        fileId: `aaaaaaaa-bbbb-4ccc-8ddd-${suffix}`,
        fileName: `${input.toolCallId}.txt`,
        lineCount: 12,
        characterCount: 24,
        size: 24,
      };
    }),
  };
  return {
    service: new ContextEngineeringService(
      prisma as never,
      model as unknown as ModelAdapter,
      files as never,
    ),
    prisma,
    model,
    files,
  };
}

describe('ContextEngineeringService', () => {
  it('spills oversized Tool Results to a file and keeps a recoverable preview', async () => {
    const { service, files } = createService();
    const result = await service.trimToolResults(
      [{ role: 'system', content: 'system' }],
      undefined,
      [
        { toolCallId: 'one', toolName: 'web_search', content: '甲'.repeat(20_000) },
        { toolCallId: 'two', toolName: 'web_search', content: '乙'.repeat(20_000) },
      ],
      'deepseek-flash',
      'session-1',
    );
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.truncated)).toBe(true);
    expect(result.every((item) => item.content.includes('fileId='))).toBe(true);
    expect(result.every((item) => item.content.includes('search_file'))).toBe(true);
    expect(files.createToolResultFile).toHaveBeenCalledTimes(2);
    expect(result[0]?.content).toContain('aaaaaaaa-bbbb-4ccc-8ddd-');
  }, 15_000);

  it('keeps the original Tool Result inline when file persistence fails', async () => {
    const { service, files } = createService({
      files: {
        createToolResultFile: vi.fn().mockRejectedValue(new Error('storage unavailable')),
      },
    });
    const content = '甲'.repeat(20_000);
    const [result] = await service.trimToolResults(
      [{ role: 'system', content: 'system' }],
      undefined,
      [{ toolCallId: 'one', toolName: 'web_search', content }],
      'deepseek-flash',
      'session-1',
    );
    expect(files.createToolResultFile).toHaveBeenCalledOnce();
    expect(result?.truncated).toBe(false);
    expect(result?.content).toBe(content);
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
      'deepseek-flash',
      'session-1',
    );

    expect(result.every((item) => item.truncated === false)).toBe(true);
    expect(result.every((item) => item.retainedTokens === item.originalTokens)).toBe(true);
    expect(result.every((item) => item.content.includes('搜索结果'))).toBe(true);
  }, 15_000);

  it('does not spill file Tool Results and returns an explicit context error instead', async () => {
    const { service, files } = createService();
    const [result] = await service.trimToolResults(
      [{ role: 'system', content: variedChinese(600_000) }],
      undefined,
      [
        {
          toolCallId: 'file-one',
          toolName: 'read_file_lines',
          content: '文件'.repeat(20_000),
          truncatable: false,
        },
      ],
      'deepseek-flash',
      'session-1',
    );

    expect(files.createToolResultFile).not.toHaveBeenCalled();
    expect(result?.truncated).toBe(true);
    expect(JSON.parse(result?.content ?? '{}')).toMatchObject({
      error: { code: 'FILE_CONTEXT_RESULT_TOO_LARGE' },
    });
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
      model: 'deepseek-flash',
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
      model: 'deepseek-flash',
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
      model: 'deepseek-flash',
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
        model: 'deepseek-flash',
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
      model: 'deepseek-flash',
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
        { role: 'user', content: variedChinese(350_000) },
        ...Array.from({ length: 12 }, (_, index) => ({
          role: 'user' as const,
          content: `最近消息 ${index}`,
        })),
      ],
    });

    expect(model.generateText.mock.calls.length).toBeGreaterThan(1);
    const estimator = getDeepSeekV3TokenEstimator();
    const promptBudget = 1_000_000 - 384_000 - Math.ceil(1_000_000 * 0.05);
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
        model: 'deepseek-flash',
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: variedChinese(700_000) },
          ...Array.from({ length: 12 }, (_, index) => ({
            role: 'user' as const,
            content: `最近消息 ${index}`,
          })),
        ],
      }),
    ).rejects.toThrow('CONTEXT_BUDGET_EXCEEDED');
    expect(model.generateText).toHaveBeenCalledTimes(2);
  }, 60_000);

  it('keeps file content intact while compacting older history and counts it in the budget', async () => {
    const { service, model } = createService();
    const fileContent = '不可截断文件内容'.repeat(4_000);
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: variedChinese(70_000) },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请分析附件' },
            { type: 'file_ref', fileId: 'file-1', fileName: 'notes.txt', content: fileContent },
          ],
        },
        ...Array.from({ length: 12 }, (_, index) => ({
          role: 'user' as const,
          content: `最近消息 ${index}`,
        })),
      ],
    });
    const fileMessage = compiled.messages.find(
      (message) =>
        message.role === 'user' &&
        Array.isArray(message.content) &&
        message.content.some((block) => block.type === 'file_ref'),
    );
    expect(fileMessage).toBeDefined();
    expect(JSON.stringify(fileMessage)).toContain(fileContent);
    expect(JSON.stringify(model.generateText.mock.calls)).not.toContain('不可截断文件内容');
  }, 15_000);

  it('collapses older Tool Results to file pointers while keeping the latest units', async () => {
    const { service, files } = createService();
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: '请分析' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'old',
              name: 'web_search',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'old',
          content:
            '[Tool Result truncated: originalTokens=9000, retainedTokens=800, strategy=head-tail, fileId=aaaaaaaa-bbbb-4ccc-8ddd-111111111111, fileName=web_search_old.txt, lineCount=40]\n预览正文不要进入下一轮',
        },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'mid',
              name: 'web_search',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        { role: 'tool', toolCallId: 'mid', content: '中间结果仍保留' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'new',
              name: 'web_search',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        { role: 'tool', toolCallId: 'new', content: '最新结果仍保留' },
      ],
    });
    const old = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'old',
    );
    const latest = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'new',
    );
    expect(old).toMatchObject({
      role: 'tool',
      content: expect.stringContaining('[Tool Result stored:'),
    });
    expect(old && 'content' in old ? old.content : '').not.toContain('预览正文不要进入下一轮');
    expect(latest).toMatchObject({ role: 'tool', content: '最新结果仍保留' });
    expect(files.createToolResultFile).not.toHaveBeenCalled();
  });
});
