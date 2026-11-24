import { describe, expect, it, vi } from 'vitest';
import { getDeepSeekV3TokenEstimator } from '@harness/deepseek-v3-tokenizer';
import { ContextEngineeringService } from '../../../src/context-engineering/context-engineering.service';
import type { ModelAdapter, ModelMessage } from '../../../src/model/model-adapter';

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
      undefined,
    ),
    prisma,
    model,
    files,
  };
}

describe('ContextEngineeringService', () => {
  it('renders an explicit Skill candidate into the compiled context', async () => {
    const { service } = createService();
    const messages = [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: '当前请求' },
    ];

    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages,
      skills: [
        {
          skillId: 'research-summary',
          version: '1.0.0',
          content: '整理研究结果并给出简洁摘要。',
          priorityHint: 10,
        },
      ],
      memories: [
        {
          memoryId: 'user-style',
          content: '用户偏好简洁的中文回答。',
          sourceRefs: [{ type: 'session', id: 'prior-session' }],
          priorityHint: 5,
        },
      ],
    });

    expect(compiled.messages.some((message) => message.role === 'system' && message.content.includes('<skills_context>'))).toBe(true);
    expect(compiled.messages.some((message) => message.role === 'system' && message.content.includes('<user_memory>'))).toBe(true);
    expect(compiled.compactionTriggered).toBe(false);
  });

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
          toolName: 'read_file',
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
  }, 45_000);

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

  it('rejects compiled messages with orphan tool results', async () => {
    const { service } = createService();
    await expect(
      service.compileRound({
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
                id: 'only-declared',
                name: 'web_search',
                arguments: '{}',
                blockSequence: 0,
                providerIndex: 0,
              },
            ],
          },
          { role: 'tool', toolCallId: 'orphan-call', content: '{"ok":true}' },
        ],
      }),
    ).rejects.toThrow(/Tool result without matching assistant tool call/);
  });

  it('collapses older Tool Results to file pointers while keeping the latest units', async () => {
    const { service, files } = createService();
    // 模拟高水位（>= 128k token 折叠阈值、< 160k 压缩阈值），触发按需折叠。
    vi.spyOn(
      service as unknown as { estimate: () => Promise<number> },
      'estimate',
    ).mockResolvedValue(130_000);
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
              id: 'oldest',
              name: 'web_search',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'oldest',
          content:
            '[Tool Result truncated: originalTokens=9000, retainedTokens=800, strategy=head-tail, fileId=aaaaaaaa-bbbb-4ccc-8ddd-111111111111, fileName=web_search_oldest.txt, lineCount=40]\n最旧预览正文不要进入下一轮',
        },
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
            '[Tool Result truncated: originalTokens=9000, retainedTokens=800, strategy=head-tail, fileId=aaaaaaaa-bbbb-4ccc-8ddd-222222222222, fileName=web_search_old.txt, lineCount=40]\n预览正文不要进入下一轮',
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
    const oldest = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'oldest',
    );
    const old = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'old',
    );
    const latest = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'new',
    );
    expect(oldest).toMatchObject({
      role: 'tool',
      content: expect.stringContaining('[Tool Result stored:'),
    });
    expect(oldest && 'content' in oldest ? oldest.content : '').not.toContain(
      '最旧预览正文不要进入下一轮',
    );
    expect(old).toMatchObject({ role: 'tool', content: expect.stringContaining('预览正文不要进入下一轮') });
    expect(latest).toMatchObject({ role: 'tool', content: '最新结果仍保留' });
    expect(files.createToolResultFile).not.toHaveBeenCalled();
  });

  it('keeps collapsed file-tool results inline while non-file tools still become stored', async () => {
    const { service, files } = createService();
    vi.spyOn(
      service as unknown as { estimate: () => Promise<number> },
      'estimate',
    ).mockResolvedValue(130_000);
    const filePayload = '{"lines":[{"n":1,"text":"审阅正文片段"}]}'.repeat(400);
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: '审阅 docx' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'file-old',
              name: 'read_file',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        { role: 'tool', toolCallId: 'file-old', content: filePayload },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'web-oldest',
              name: 'web_search',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        { role: 'tool', toolCallId: 'web-oldest', content: '联网历史结果'.repeat(200) },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'web-mid',
              name: 'web_search',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        { role: 'tool', toolCallId: 'web-mid', content: '中间联网结果' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'web-mid2',
              name: 'web_search',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        { role: 'tool', toolCallId: 'web-mid2', content: '次近联网结果' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'web-new',
              name: 'web_search',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        { role: 'tool', toolCallId: 'web-new', content: '最新联网结果' },
      ],
    });
    const fileTool = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'file-old',
    );
    const webOld = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'web-oldest',
    );
    expect(fileTool).toMatchObject({ role: 'tool', content: filePayload });
    expect(fileTool?.content).not.toContain('[Tool Result stored:');
    expect(webOld?.content).toContain('[Tool Result stored:');
    expect(files.createToolResultFile).toHaveBeenCalledTimes(1);
  });

  it('does not store read_file_lines alias results during historical collapse', async () => {
    const { service, files } = createService();
    const payload = 'alias-read-lines-body';
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: '读行' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'lines-old',
              name: 'read_file_lines',
              arguments: '{}',
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        { role: 'tool', toolCallId: 'lines-old', content: payload },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            { id: 'w1', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
          ],
        },
        { role: 'tool', toolCallId: 'w1', content: 'a'.repeat(500) },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            { id: 'w2', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
          ],
        },
        { role: 'tool', toolCallId: 'w2', content: 'b'.repeat(500) },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            { id: 'w3', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
          ],
        },
        { role: 'tool', toolCallId: 'w3', content: 'c'.repeat(500) },
      ],
    });
    const lines = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'lines-old',
    );
    expect(lines).toMatchObject({ content: payload });
    expect(files.createToolResultFile).not.toHaveBeenCalled();
  });

  it('writes collapsed Tool Result pointers back so later rounds do not re-spill', async () => {
    const { service, files } = createService();
    vi.spyOn(
      service as unknown as { estimate: () => Promise<number> },
      'estimate',
    ).mockResolvedValue(130_000);
    const oldContent = '历史搜索结果。'.repeat(200);
    const live = [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: '请分析' },
      {
        role: 'assistant' as const,
        content: null,
        toolCalls: [
          {
            id: 'oldest',
            name: 'web_search',
            arguments: '{}',
            blockSequence: 0,
            providerIndex: 0,
          },
        ],
      },
      { role: 'tool' as const, toolCallId: 'oldest', content: oldContent },
      {
        role: 'assistant' as const,
        content: null,
        toolCalls: [
          { id: 'old', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
        ],
      },
      { role: 'tool' as const, toolCallId: 'old', content: '次旧结果仍保留' },
      {
        role: 'assistant' as const,
        content: null,
        toolCalls: [
          { id: 'mid', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
        ],
      },
      { role: 'tool' as const, toolCallId: 'mid', content: '中间结果仍保留' },
      {
        role: 'assistant' as const,
        content: null,
        toolCalls: [
          { id: 'new', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
        ],
      },
      { role: 'tool' as const, toolCallId: 'new', content: '最新结果仍保留' },
    ];
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: live,
    });
    expect(files.createToolResultFile).toHaveBeenCalledOnce();
    service.applyCollapsedToolPointers(live, compiled.messages);
    expect(
      live.find((message) => message.role === 'tool' && message.toolCallId === 'oldest'),
    ).toEqual(expect.objectContaining({ content: expect.stringContaining('[Tool Result stored:') }));
    expect(live.find((message) => message.role === 'tool' && message.toolCallId === 'old')).toEqual(
      expect.objectContaining({ content: '次旧结果仍保留' }),
    );
    files.createToolResultFile.mockClear();
    await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: live,
    });
    expect(files.createToolResultFile).not.toHaveBeenCalled();
  });

  it('collapses older create_file arguments to pointers and keeps the latest write intact', async () => {
    const { service } = createService();
    const oldContent = '旧版本正文'.repeat(2_000);
    const midContent = '中间版本正文'.repeat(2_000);
    const latestContent = '当前版本正文'.repeat(2_000);
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: '做一个看板' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'write-1',
              name: 'create_file',
              arguments: JSON.stringify({
                fileName: 'dashboard.html',
                contentMode: 'html',
                content: oldContent,
              }),
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'write-1',
          content: JSON.stringify({
            ok: true,
            output: {
              artifact: {
                artifactId: 'artifact-1',
                fileId: '11111111-1111-4111-8111-111111111111',
              },
              file: { fileId: '11111111-1111-4111-8111-111111111111', fileName: 'dashboard.html' },
            },
          }),
        },
        { role: 'user', content: '改一下配色' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'write-2',
              name: 'create_file',
              arguments: JSON.stringify({
                fileName: 'dashboard.html',
                contentMode: 'html',
                content: midContent,
              }),
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'write-2',
          content: JSON.stringify({
            ok: true,
            output: {
              artifact: {
                artifactId: 'artifact-2',
                fileId: '22222222-2222-4222-8222-222222222222',
              },
              file: { fileId: '22222222-2222-4222-8222-222222222222', fileName: 'dashboard.html' },
            },
          }),
        },
        { role: 'user', content: '再改一下标题' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'write-3',
              name: 'create_file',
              arguments: JSON.stringify({
                fileName: 'dashboard.html',
                contentMode: 'html',
                content: latestContent,
              }),
              blockSequence: 0,
              providerIndex: 0,
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'write-3',
          content: JSON.stringify({
            ok: true,
            output: {
              artifact: {
                artifactId: 'artifact-3',
                fileId: '33333333-3333-4333-8333-333333333333',
              },
              file: { fileId: '33333333-3333-4333-8333-333333333333', fileName: 'dashboard.html' },
            },
          }),
        },
      ],
    });

    const writeArguments = (callId: string): string => {
      for (const message of compiled.messages) {
        if (message.role !== 'assistant') continue;
        const call = message.toolCalls?.find((item) => item.id === callId);
        if (call) return call.arguments;
      }
      throw new Error(`missing call ${callId}`);
    };

    const first = JSON.parse(writeArguments('write-1')) as Record<string, unknown>;
    const second = JSON.parse(writeArguments('write-2')) as Record<string, unknown>;
    const third = JSON.parse(writeArguments('write-3')) as Record<string, unknown>;

    // 只有最近一次写入保留完整正文，历史两次折叠为带产物 fileId 的指针。
    expect(third.content).toBe(latestContent);
    expect(first.content).toBeUndefined();
    expect(second.content).toBeUndefined();
    expect(first).toMatchObject({
      fileName: 'dashboard.html',
      contentMode: 'html',
      contentOmitted: true,
      fileId: '11111111-1111-4111-8111-111111111111',
    });
    expect(second).toMatchObject({
      contentOmitted: true,
      fileId: '22222222-2222-4222-8222-222222222222',
    });
    expect(first.originalCharacterCount).toBe([...oldContent].length);
    expect(writeArguments('write-1')).not.toContain(oldContent);

    // toolCalls 与 tool 结果的配对结构不变，工具链校验仍通过。
    expect(compiled.messages.filter((message) => message.role === 'tool')).toHaveLength(3);
  });

  it('produces byte-identical collapsed write arguments across repeated compiles', async () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: '生成报告' },
    ];
    for (const index of [1, 2, 3, 4]) {
      messages.push({
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: `write-${index}`,
            name: 'create_report',
            arguments: JSON.stringify({
              title: `第 ${index} 版`,
              summary: '摘要',
              fileName: 'report.md',
              content: `正文${index}`.repeat(1_500),
            }),
            blockSequence: 0,
            providerIndex: 0,
          },
        ],
      });
      messages.push({
        role: 'tool',
        toolCallId: `write-${index}`,
        content: JSON.stringify({
          ok: true,
          output: {
            file: {
              fileId: `${index}${index}${index}${index}${index}${index}${index}${index}-1111-4111-8111-111111111111`,
            },
          },
        }),
      });
      messages.push({ role: 'user', content: `继续 ${index}` });
    }

    const first = await createService().service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: structuredClone(messages),
    });
    // 模拟下一轮：Runtime 用上一轮编译结果回填后再编译。
    const second = await createService().service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: structuredClone(first.messages),
    });
    expect(second.messages).toEqual(first.messages);
    expect(JSON.stringify(second.messages)).toBe(JSON.stringify(first.messages));
  });

  it('keeps write tool results inline so the pointer fileId does not drift across rounds', async () => {
    const { service, files } = createService();
    const messages: ModelMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: '生成文件' },
    ];
    for (let index = 0; index < 6; index += 1) {
      const callId = `write-${index}`;
      const fileId = `${String(index).repeat(8)}-1111-4111-8111-111111111111`;
      messages.push({
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: callId,
            name: 'create_file',
            arguments: JSON.stringify({
              fileName: `file-${index}.html`,
              content: '<html><body>正文</body></html>'.repeat(300),
            }),
            blockSequence: 0,
            providerIndex: 0,
          },
        ],
      });
      messages.push({
        role: 'tool',
        toolCallId: callId,
        content: JSON.stringify({
          ok: true,
          untrustedToolData: true,
          output: {
            artifact: { artifactId: `artifact-${index}`, fileId, fileName: `file-${index}.html` },
            file: {
              fileId,
              fileName: `file-${index}.html`,
              mediaType: 'text/html',
              size: 9_000,
              status: 'ready',
              origin: 'agent_generated',
              artifactId: `artifact-${index}`,
              // 让结果稳定超过 collapseOldToolResults 的 256 token 阈值。
              previewUrl: `/api/files/${fileId}/preview?padding=${'x'.repeat(2_000)}`,
            },
          },
        }),
      });
      messages.push({ role: 'user', content: `下一步 ${index}` });
    }

    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages,
    });

    // 写入结果属于产物引用：外置会丢掉产物 fileId，下一轮折叠指针随之漂移。
    expect(files.createToolResultFile).not.toHaveBeenCalled();
    const oldestResult = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'write-0',
    );
    expect(oldestResult).toMatchObject({
      role: 'tool',
      content: expect.not.stringContaining('[Tool Result stored:'),
    });
    expect(oldestResult && oldestResult.role === 'tool' ? oldestResult.content : '').toContain(
      '"fileId":"00000000-1111-4111-8111-111111111111"',
    );
  });

  it('counts every visible image at the provider per-image token cap', async () => {
    const { service } = createService();
    const images = Array.from({ length: 9 }, (_, index) => ({
      type: 'image_ref' as const,
      fileId: `image-${index}`,
    }));
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: [{ type: 'text', text: '同一条消息里的多张图' }, ...images] },
      ],
    });

    // 9 张图最少计入 9 × 1024，避免图片在预算中静默消失。
    expect(compiled.estimatedInputTokens).toBeGreaterThanOrEqual(9 * 1_024);
    expect(compiled.messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: [{ type: 'text', text: '同一条消息里的多张图' }, ...images] },
    ]);
  });

  it('keeps compacting history when the conversation starts with an image', async () => {
    const { service, model } = createService();
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: 'system' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '先看这张图' },
            { type: 'image_ref', fileId: 'first-image' },
          ],
        },
        { role: 'user', content: variedChinese(100_000) },
        ...Array.from({ length: 12 }, (_, index) => ({
          role: 'user' as const,
          content: `最近消息 ${index}`,
        })),
      ],
    });

    // 图片可以被摘要替代；保护它会让早期带图会话永远无法压缩。
    expect(compiled.compactionTriggered).toBe(true);
    expect(model.generateText).toHaveBeenCalled();
  }, 15_000);

  it('omits the oldest images, keeping fileId placeholders, until the round fits', async () => {
    const { service } = createService();
    const messages: ModelMessage[] = [
      { role: 'system' as const, content: 'system' },
      ...Array.from({ length: 9 }, (_, index) => ({
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: `第 ${index + 1} 张图` },
          { type: 'image_ref' as const, fileId: `image-${index}` },
        ],
      })),
    ];
    // 直接驱动预算兜底分支：9 张图 9216 token，这里只允许约 5 张图的空间。
    const internals = service as unknown as {
      offloadOldestImagesUntilFits: (
        messages: ModelMessage[],
        tools: undefined,
        promptBudget: number,
      ) => Promise<{ messages: ModelMessage[] }>;
      estimate: (messages: ModelMessage[]) => Promise<number>;
    };
    const offloaded = (await internals.offloadOldestImagesUntilFits(messages, undefined, 5_000))
      .messages;
    const estimatedTokens = await internals.estimate(offloaded);

    const placeholders = offloaded.flatMap((message) =>
      message.role === 'user' && Array.isArray(message.content)
        ? message.content
            .filter((block) => block.type === 'text' && block.text.includes('[image omitted'))
            .map((block) => (block.type === 'text' ? block.text : ''))
        : [],
    );
    const remaining = offloaded.flatMap((message) =>
      message.role === 'user' && Array.isArray(message.content)
        ? message.content.filter((block) => block.type === 'image_ref')
        : [],
    );
    // 最旧优先省略，占位保留 fileId 以便按需重读。
    expect(placeholders.length).toBeGreaterThan(0);
    expect(placeholders[0]).toContain('fileId=image-0');
    expect(placeholders.some((text) => text.includes('fileId=image-8'))).toBe(false);
    expect(remaining.length).toBeLessThan(9);
    expect(remaining.at(-1)).toMatchObject({ fileId: 'image-8' });
    expect(estimatedTokens).toBeLessThanOrEqual(5_000);
  });

  it('skips collapsing old Tool Results below the 128k watermark to preserve KV-Cache prefix', async () => {
    const { service, files } = createService();
    const oldContent = '历史搜索结果正文。'.repeat(100);
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
            { id: 'oldest', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
          ],
        },
        { role: 'tool', toolCallId: 'oldest', content: oldContent },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            { id: 'old', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
          ],
        },
        { role: 'tool', toolCallId: 'old', content: '次旧结果' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            { id: 'mid', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
          ],
        },
        { role: 'tool', toolCallId: 'mid', content: '中间结果' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            { id: 'new', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
          ],
        },
        { role: 'tool', toolCallId: 'new', content: '最新结果' },
      ],
    });
    const oldest = compiled.messages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'oldest',
    );
    expect(oldest).toMatchObject({ role: 'tool', content: oldContent });
    expect(files.createToolResultFile).not.toHaveBeenCalled();
  });

  it('skips compaction when net token savings are below 20% and within prompt budget', async () => {
    const { service } = createService();
    // 第一次估算 170k（达到 160k 触发线、未超 566k 预算），折叠后再估算仍 170k，
    // 压缩后 mock 返回 150k（仅省 11.8% < 20%），应放弃压缩保留原消息与前缀缓存。
    vi.spyOn(
      service as unknown as { estimate: () => Promise<number> },
      'estimate',
    ).mockResolvedValue(170_000);
    vi.spyOn(
      service as unknown as { compact: () => Promise<unknown> },
      'compact',
    ).mockResolvedValue({
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'compacted' },
      ],
      estimatedInputTokens: 150_000,
      compactionState: {
        version: 1,
        summary: 'short',
        coveredThroughMessageId: 'u1',
        coveredMessageCount: 2,
        coveredUserTurns: 1,
        updatedAt: new Date().toISOString(),
      },
    });
    const compiled = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: '原始请求' },
      ],
    });
    expect(compiled.compactionTriggered).toBe(false);
    expect(compiled.compactionState).toBeUndefined();
    expect(compiled.messages.some((m) => m.role === 'user' && m.content === '原始请求')).toBe(true);
  });

  it('counts assistant reasoning tokens when assistant message has toolCalls', async () => {
    const { service } = createService();
    const reasoningText = '深度推理过程分析。'.repeat(200);
    const baseMessages: ModelMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: '请调研' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          { id: 'c1', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
        ],
      },
      { role: 'tool', toolCallId: 'c1', content: '结果' },
    ];
    const withReasoningMessages: ModelMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: '请调研' },
      {
        role: 'assistant',
        content: null,
        reasoning: reasoningText,
        toolCalls: [
          { id: 'c1', name: 'web_search', arguments: '{}', blockSequence: 0, providerIndex: 0 },
        ],
      },
      { role: 'tool', toolCallId: 'c1', content: '结果' },
    ];
    const withoutReasoning = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: baseMessages,
    });
    const withReasoning = await service.compileRound({
      sessionId: 'session-1',
      model: 'deepseek-flash',
      messages: withReasoningMessages,
    });
    expect(withReasoning.estimatedInputTokens).toBeGreaterThan(
      withoutReasoning.estimatedInputTokens + 500,
    );
  });
});
