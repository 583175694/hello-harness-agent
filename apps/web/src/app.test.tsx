import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  App,
  AppShell,
  PreviewSwitcher,
  applyToolEvent,
  groupSessionSummaries,
  optimisticRevisionAttachments,
  workbenchFromPersistedMessage,
} from './app';
import type {
  FileRef,
  PersistedMessage,
  SessionSummary,
  WebFetchResult,
} from '@harness/agent-protocol';
import type { ToolStreamEvent } from './api/client';
import { Composer } from './features/agent/components/conversation';
import { PREVIEW_STATES, makeFixture } from './features/agent/fixtures/preview';
import type { WorkbenchState } from './features/agent/model/types';

function runFrame(
  type: string,
  payload: unknown,
  seq: number,
  runId = 'run-test',
  sessionId = 'session-test',
): string {
  const eventPayload =
    payload &&
    typeof payload === 'object' &&
    ['message.delta', 'tool.started', 'tool.completed', 'tool.failed', 'tool.cancelled'].includes(
      type,
    )
      ? {
          ...(payload as Record<string, unknown>),
          roundId: (payload as Record<string, unknown>).roundId ?? 'round-1',
          roundSequence: (payload as Record<string, unknown>).roundSequence ?? 1,
          blockSequence: (payload as Record<string, unknown>).blockSequence ?? 0,
        }
      : payload;
  return `id: ${seq}\nevent: ${type}\ndata: ${JSON.stringify({
    version: '0.13.0',
    eventId: `event-${seq}`,
    seq,
    sessionId,
    runId,
    type,
    occurredAt: '2026-08-05T04:00:01.000Z',
    payload: eventPayload,
  })}\n\n`;
}

const publicModelConfig = {
  defaultModel: 'deepseek-v4-flash',
  models: [
    {
      id: 'deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      reasoning: { supported: true, levels: ['off', 'low', 'high', 'max'], default: 'high' },
    },
    {
      id: 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      reasoning: { supported: true, levels: ['off', 'low', 'high', 'max'], default: 'high' },
    },
  ],
};

const mockAuthUser = {
  id: 'local-user',
  displayName: 'Local',
  email: null,
  phone: null,
  role: 'user' as const,
  status: 'active' as const,
};

function authMeResponse(): Response {
  return new Response(JSON.stringify({ user: mockAuthUser }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function authMeFetch(url: string): Response | undefined {
  return url.includes('/api/auth/me') ? authMeResponse() : undefined;
}

async function mountProductionApp() {
  window.history.replaceState({}, '', '/agent');
  render(<App />);
  await waitForProductionShell();
}

async function waitForProductionShell() {
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: '任务输入' })).toBeInTheDocument();
  });
}

function mockReady() {
  // 为组件测试提供稳定的 API 就绪响应。
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const auth = authMeFetch(url);
      if (auth) return Promise.resolve(auth);
      let body: unknown;
      if (url.includes('/api/auth/me')) {
        body = { user: mockAuthUser };
      } else if (url.includes('/api/agent/config/public')) {
        body = publicModelConfig;
      } else if (url.endsWith('/api/agent/sessions')) {
        body = { sessions: [] };
      } else {
        body = {
          status: 'ok',
          service: 'hello-harness-api',
          version: '0.1.0',
          checks: { database: 'ok', artifactStore: 'ok' },
        };
      }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

describe('R1 workbench shell', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/agent');
    mockReady();
  });

  it('groups sessions into exclusive local-time ranges and keeps pinned sessions first', () => {
    const now = new Date(2026, 8, 16, 12);
    const session = (id: string, daysAgo: number, isPinned = false, hour = 10): SessionSummary => {
      const updatedAt = new Date(2026, 8, 16 - daysAgo, hour).toISOString();
      return {
        id,
        title: id,
        status: 'active',
        isPinned,
        createdAt: updatedAt,
        updatedAt,
      };
    };
    const groups = groupSessionSummaries(
      [
        session('older', 45),
        session('this-month', 14),
        session('this-week-older', 5),
        session('today-older', 0, false, 8),
        session('yesterday', 1),
        session('today-latest', 0, false, 11),
        session('pinned-old', 120, true),
      ],
      now,
    );

    expect(groups.map((group) => group.label)).toEqual([
      '置顶',
      '今天',
      '昨天',
      '过去 7 天',
      '过去 30 天',
      '更早',
    ]);
    expect(groups[1]?.sessions.map((item) => item.id)).toEqual(['today-latest', 'today-older']);
    expect(groups.flatMap((group) => group.sessions)).toHaveLength(7);
  });

  it('adds the base artifact to an optimistic revision message without duplicating files', () => {
    const explicit: FileRef[] = [
      {
        fileId: 'file-upload',
        fileName: 'notes.txt',
        mediaType: 'text/plain',
        size: 12,
        status: 'ready',
        fileKind: 'text',
        origin: 'user_uploaded',
      },
    ];
    const workbench: WorkbenchState = {
      runId: 'run-2',
      title: '执行详情',
      subtitle: '当前运行',
      activeView: 'artifact',
      activityStatus: 'completed',
      executions: [],
      followMode: 'auto',
      sources: [],
      artifactSeries: [
        {
          seriesId: 'series-1',
          sessionId: 'session-1',
          logicalName: 'result.md',
          currentArtifactId: 'artifact-2',
          createdAt: '2026-09-10T00:00:00.000Z',
          updatedAt: '2026-09-10T01:00:00.000Z',
          versions: [
            {
              artifactId: 'artifact-1',
              fileId: 'file-base',
              fileName: 'result.md',
              mediaType: 'text/markdown',
              fileKind: 'markdown',
              size: 1024,
              status: 'ready',
              createdAt: '2026-09-10T00:00:00.000Z',
              seriesId: 'series-1',
              versionNumber: 1,
            },
          ],
        },
      ],
      open: true,
    };
    const revisionContext = {
      seriesId: 'series-1',
      baseArtifactId: 'artifact-1',
      expectedCurrentArtifactId: 'artifact-2',
    };

    const result = optimisticRevisionAttachments(explicit, revisionContext, workbench);

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      fileId: 'file-base',
      fileName: 'result.md',
      status: 'ready',
      fileKind: 'markdown',
      origin: 'agent_generated',
      artifactId: 'artifact-1',
    });
    expect(optimisticRevisionAttachments(result, revisionContext, workbench)).toBe(result);
    expect(optimisticRevisionAttachments(explicit, undefined, workbench)).toBe(explicit);
  });

  it('renders the production empty state without an empty workbench', async () => {
    await mountProductionApp();
    expect(screen.getByText('Harness')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '任务输入' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '工作区' })).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  });

  it('does not submit Enter while an input method is composing text', () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    render(
      <Composer
        prompt="候选内容"
        submitting={false}
        serviceState="ready"
        mode="new-run"
        onPromptChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const input = screen.getByRole('textbox', { name: '任务输入' });

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits Enter while a runtime follow-up is being queued', () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    render(
      <Composer
        prompt="重点关注科技板块"
        submitting
        serviceState="ready"
        mode="steer"
        onPromptChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: '任务输入' }), {
      key: 'Enter',
      code: 'Enter',
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('uses the stop button only while runtime input is empty', () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    const onCancel = vi.fn();
    const { rerender } = render(
      <Composer
        prompt=""
        submitting
        serviceState="ready"
        mode="steer"
        onPromptChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    const input = screen.getByRole('textbox', { name: '任务输入' });
    const stop = screen.getByRole('button', { name: '停止任务' });
    expect(stop).toHaveClass('is-stop');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(stop);
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <Composer
        prompt="补充科技板块"
        submitting
        serviceState="ready"
        mode="steer"
        onPromptChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    const followUp = screen.getByRole('button', { name: '提交后续消息' });
    expect(followUp).toHaveClass('is-ready');
    fireEvent.click(followUp);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders sources and report in the development fixture preview', () => {
    render(
      <AppShell
        contentFontSize={14}
        onContentFontSizeChange={() => undefined}
        previewState={{
          label: '市场调研',
          subtitle: '网页检索',
          conversation: [{ id: 'u', kind: 'user', content: '调研 AI 市场' }],
          workbench: {
            runId: 'run-1',
            title: 'AI 市场',
            subtitle: '4 个来源',
            activeView: 'sources',
            activityStatus: 'running',
            executions: [],
            followMode: 'auto',
            sources: [
              {
                id: 'S1',
                title: '来源标题',
                domain: 'example.com',
                url: 'https://example.com',
                excerpt: '原文片段',
                time: '刚刚',
              },
            ],
            open: true,
          },
        }}
      />,
    );
    expect(screen.getByRole('complementary', { name: '工作区' })).toBeInTheDocument();
    expect(screen.getByText('来源标题')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sources' })).toHaveAttribute('aria-selected', 'true');
  });

  it('produces the same canonical sources during streaming and persisted recovery', () => {
    const completedAt = '2026-08-11T10:00:01.000Z';
    const sourceUrl = 'https://example.com/article';
    const mirrorUrl = 'https://mirror.example/article';
    const exact = 'Canonical source passage.';
    const stats = {
      requestedCount: 1,
      networkAttemptCount: 1,
      succeededCount: 1,
      failedCount: 0,
      skippedCount: 0,
      passageCount: 1,
      passageCharacterCount: exact.length,
      cacheHitCount: 0,
    };
    const fetchedItem = (url: string) => ({
      status: 'succeeded' as const,
      requestedUrl: url,
      finalUrl: url,
      normalizedUrl: url,
      title: 'Canonical article',
      contentType: 'text/html',
      retrievedAt: completedAt,
      contentHash: 'shared-hash',
      cacheStatus: 'miss' as const,
      truncated: false,
      passages: [
        {
          passageId: `passage-${new URL(url).hostname}`,
          text: exact,
          locator: {
            kind: 'web_text' as const,
            quote: { exact },
            position: { start: 0, end: exact.length },
          },
        },
      ],
    });
    const searchEvent: ToolStreamEvent = {
      type: 'tool.completed',
      messageId: 'assistant-1',
      blockId: 'search-block',
      toolCallId: 'search-1',
      toolName: 'web_search',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
      completedAt,
      durationMs: 10,
      result: {
        query: 'canonical source',
        provider: 'serp',
        results: [
          {
            id: 'search-source',
            title: 'Search clue',
            url: sourceUrl,
            domain: 'example.com',
            snippet: 'Search clue snippet.',
          },
        ],
      },
    };
    const fetchEvent = (toolCallId: string, url: string): ToolStreamEvent => ({
      type: 'tool.completed',
      messageId: 'assistant-1',
      blockId: `${toolCallId}-block`,
      toolCallId,
      toolName: 'web_fetch',
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
      completedAt,
      durationMs: 20,
      result: { results: [fetchedItem(url)], stats } satisfies WebFetchResult,
    });
    let streamed = applyToolEvent(undefined, searchEvent, true);
    streamed = applyToolEvent(streamed, fetchEvent('fetch-1', sourceUrl), true);
    streamed = applyToolEvent(streamed, fetchEvent('fetch-2', mirrorUrl), true);

    const persisted: PersistedMessage = {
      id: 'assistant-1',
      sessionId: 'session-1',
      role: 'assistant',
      kind: 'assistant_delivery',
      content: 'Answer.',
      createdAt: completedAt,
      metadata: {
        model: 'test-model',
        agent: {
          toolCallCount: 3,
          executions: [
            {
              toolCallId: 'search-1',
              toolName: 'web_search',
              input: { query: 'canonical source' },
              status: 'completed',
              startedAt: completedAt,
              completedAt,
              durationMs: 10,
              resultCount: 1,
            },
            ...['fetch-1', 'fetch-2'].map((toolCallId, index) => ({
              toolCallId,
              toolName: 'web_fetch' as const,
              input: { urls: [index === 0 ? sourceUrl : mirrorUrl] },
              status: 'completed' as const,
              startedAt: completedAt,
              completedAt,
              durationMs: 20,
              resultCount: 1,
              stats,
            })),
          ],
          sources: [
            {
              ...fetchedItem(sourceUrl),
              kind: 'fetched',
              status: undefined,
              id: 'search-source',
              used: false,
              provenance: 'search_clue',
              toolCallIds: ['search-1', 'fetch-1', 'fetch-2'],
            },
          ],
        },
      },
    };
    const restored = workbenchFromPersistedMessage(persisted);

    expect(streamed.sources).toHaveLength(1);
    expect(restored?.sources).toHaveLength(1);
    expect(streamed.sources[0]).toEqual(restored?.sources[0]);
    expect(streamed.sources[0]).toMatchObject({
      id: 'F1',
      provenance: 'search_clue',
      requestedUrl: sourceUrl,
      contentHash: 'shared-hash',
      toolCallIds: ['search-1', 'fetch-1', 'fetch-2'],
    });
  });

  it('restores a context-only workbench from the final assistant message', () => {
    const message: PersistedMessage = {
      id: 'assistant-context',
      sessionId: 'session-context',
      role: 'assistant',
      kind: 'assistant_delivery',
      content: '你好',
      runId: 'run-context',
      createdAt: '2026-08-18T01:00:00.000Z',
      metadata: {
        model: 'deepseek-v4-flash',
        deliveryStatus: 'completed',
        runId: 'run-context',
        context: {
          version: 1,
          roundSequence: 1,
          attempt: 1,
          estimatedInputTokens: 64,
          promptBudget: 1_000,
          compactionTriggered: false,
          finalResponseOnly: true,
          messages: [{ role: 'user', content: '你好' }],
          tools: [],
        },
      },
    };

    expect(workbenchFromPersistedMessage(message)).toMatchObject({
      runId: 'run-context',
      activeView: 'context',
      context: { estimatedInputTokens: 64 },
      executions: [],
      sources: [],
    });
  });

  it('labels file-only tool activity as file reading in streaming and recovery', () => {
    const started: ToolStreamEvent = {
      type: 'tool.started',
      messageId: 'assistant-file',
      blockId: 'file-tool-block',
      toolCallId: 'file-call',
      toolName: 'search_file',
      title: '搜索文件',
      input: { fileId: 'file-1', query: '错误' },
      startedAt: '2026-09-08T04:00:00.000Z',
      roundId: 'round-file',
      roundSequence: 1,
      blockSequence: 0,
    };
    const streamed = applyToolEvent(undefined, started, true);
    expect(streamed).toMatchObject({ title: '文件读取', subtitle: '1 次文件调用' });

    const restored = workbenchFromPersistedMessage({
      id: 'assistant-file',
      sessionId: 'session-file',
      role: 'assistant',
      kind: 'assistant_delivery',
      content: '文件结论',
      runId: 'run-file',
      createdAt: '2026-09-08T04:00:01.000Z',
      metadata: {
        model: 'deepseek-v4-flash',
        agent: {
          toolCallCount: 2,
          sources: [],
          executions: [
            {
              toolCallId: 'file-search',
              toolName: 'search_file',
              input: { fileId: 'file-1', query: '错误' },
              status: 'completed',
              startedAt: '2026-09-08T04:00:00.000Z',
              completedAt: '2026-09-08T04:00:00.100Z',
              durationMs: 100,
              resultCount: 2,
            },
            {
              toolCallId: 'file-read',
              toolName: 'read_file_lines',
              input: { fileId: 'file-1', startLine: 1, endLine: 10 },
              status: 'completed',
              startedAt: '2026-09-08T04:00:00.200Z',
              completedAt: '2026-09-08T04:00:00.300Z',
              durationMs: 100,
              resultCount: 10,
            },
          ],
        },
      },
    });
    expect(restored).toMatchObject({ title: '文件读取', subtitle: '2 次文件调用' });
  });

  it('opens the artifact workbench as soon as create_report completes', () => {
    const started: ToolStreamEvent = {
      type: 'tool.started',
      messageId: 'assistant-report',
      blockId: 'tool-report',
      toolCallId: 'call-report',
      toolName: 'create_report',
      title: '生成报告：走势复盘',
      input: {
        title: '走势复盘',
        summary: '摘要',
        fileName: 'report.md',
        contentCharacterCount: 12,
        contentByteCount: 12,
      },
      startedAt: '2026-09-21T09:00:00.000Z',
      roundId: 'round-10',
      roundSequence: 10,
      blockSequence: 1,
    };
    const completed: ToolStreamEvent = {
      type: 'tool.completed',
      messageId: 'assistant-report',
      blockId: 'tool-report',
      toolCallId: 'call-report',
      toolName: 'create_report',
      completedAt: '2026-09-21T09:00:01.000Z',
      durationMs: 80,
      result: {
        report: {
          reportId: 'report-1',
          artifactId: 'artifact-report',
          runId: 'run-1',
          title: '走势复盘',
          summary: '摘要',
          sourceIds: [],
          fileIds: [],
          status: 'ready',
          createdAt: '2026-09-21T09:00:01.000Z',
          updatedAt: '2026-09-21T09:00:01.000Z',
        },
        artifact: {
          artifactId: 'artifact-report',
          fileId: 'file-report',
          fileName: 'report.md',
          mediaType: 'text/markdown',
          fileKind: 'markdown',
          size: 12,
          status: 'ready',
          createdAt: '2026-09-21T09:00:01.000Z',
        },
        file: {
          fileId: 'file-report',
          fileName: 'report.md',
          mediaType: 'text/markdown',
          size: 12,
          status: 'ready',
          fileKind: 'markdown',
        },
      },
      roundId: 'round-10',
      roundSequence: 10,
      blockSequence: 1,
    };
    const streamed = applyToolEvent(applyToolEvent(undefined, started, false), completed, true);
    expect(streamed).toMatchObject({
      open: true,
      activeView: 'artifact',
      artifacts: [expect.objectContaining({ artifactId: 'artifact-report', fileName: 'report.md' })],
      focusTarget: { kind: 'artifact', artifactId: 'artifact-report' },
    });
  });

  it('exposes a mock state switcher on the preview route', () => {
    render(
      <>
        <AppShell
          previewState={makeFixture('waiting')}
          theme="light"
          contentFontSize={14}
          onContentFontSizeChange={() => undefined}
        />
        <PreviewSwitcher active="waiting" />
      </>,
    );
    expect(screen.getByRole('navigation', { name: '预览状态' })).toBeInTheDocument();
    expect(screen.getAllByText('确认检索时间范围').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '最终报告' })).toHaveAttribute(
      'href',
      '/agent/preview?state=final-report',
    );
  });

  it('keeps the preview matrix aligned with runtime controls and queued input states', () => {
    expect(PREVIEW_STATES.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'queued',
        'pause-requested',
        'paused',
        'resuming',
        'clarification',
        'tool-approval',
        'final-answer',
        'follow-up-pending',
        'steer-pending',
        'steer-accepted',
        'reasoning',
        'artifacts',
        'attachments',
        'context-compacted',
      ]),
    );
    expect(makeFixture('follow-up-pending').pendingInputs).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'follow_up', status: 'pending' })]),
    );
    expect(makeFixture('steer-pending').pendingInputs).toEqual([
      expect.objectContaining({ kind: 'steer', status: 'pending' }),
    ]);
    expect(makeFixture('clarification').activeInterrupt).toMatchObject({
      kind: 'clarification',
      status: 'pending',
    });
    expect(makeFixture('tool-approval').activeInterrupt).toMatchObject({
      kind: 'tool_approval',
      status: 'pending',
    });
    expect(
      makeFixture('steer-accepted').conversation.some(
        (item) =>
          item.kind === 'assistant' &&
          item.blocks.some((block) => block.type === 'user_intervention'),
      ),
    ).toBe(true);
  });

  it('covers reasoning, artifacts, attachments, and compacted context in preview fixtures', () => {
    expect(makeFixture('reasoning').conversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistant',
          blocks: expect.arrayContaining([expect.objectContaining({ type: 'reasoning' })]),
        }),
      ]),
    );
    expect(makeFixture('artifacts').workbench?.artifacts).toHaveLength(3);
    expect(makeFixture('attachments').conversation[0]).toMatchObject({
      kind: 'user',
      attachments: expect.arrayContaining([
        expect.objectContaining({ fileKind: 'image' }),
        expect.objectContaining({ fileKind: 'pdf' }),
      ]),
    });
    expect(makeFixture('context-compacted').context).toMatchObject({
      compactionTriggered: true,
    });
    expect(PREVIEW_STATES.map((item) => item.id)).not.toContain('plan-cleared');
  });

  it.each([
    ['reasoning', 'Thought for 8 seconds'],
    ['artifacts', '市场调研报告.pdf'],
    ['context-compacted', 'Model Round 6'],
  ] as const)('renders the %s feature preview', (state, expectedText) => {
    window.history.replaceState({}, '', `/agent/preview?state=${state}`);
    render(<App />);
    expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
  });

  it('renders the attachments feature preview', () => {
    window.history.replaceState({}, '', '/agent/preview?state=attachments');
    render(<App />);
    expect(screen.getByRole('button', { name: '预览需求说明.pdf' })).toBeInTheDocument();
  });

  it('renders fetched passages as unnumbered read sources', () => {
    window.history.replaceState({}, '', '/agent/preview?state=fetch-candidate');
    render(<App />);
    expect(screen.getByText('F1')).toBeInTheDocument();
    expect(screen.queryByText('[F1]')).not.toBeInTheDocument();
    expect(screen.queryByText('[S1]')).not.toBeInTheDocument();
    expect(screen.getByText('已读取网页')).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看 1 段原文'));
    expect(screen.getAllByText(/企业正在把生成式 AI/)).toHaveLength(2);
    expect(screen.getByText(/^位置 9–/)).toBeInTheDocument();
  });

  it('opens the workbench from an inline tool activity and focuses the selected call', () => {
    window.history.replaceState({}, '', '/agent/preview?state=tool-running');
    render(<App />);
    expect(screen.queryByRole('complementary', { name: '工作区' })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-label="工作区"]')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: '交叉验证关键结论，执行中' }));
    expect(screen.getByRole('complementary', { name: '工作区' })).toHaveClass('is-open');
    expect(screen.getByText('调用时间线')).toBeInTheDocument();
    expect(screen.getByText('业务输入')).toBeInTheDocument();
    const workspace = screen.getByRole('complementary', { name: '工作区' });
    expect(
      workspace.querySelector('.execution-detail')!.compareDocumentPosition(
        workspace.querySelector('.execution-timeline')!,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps preview input lightweight without creating a run card', () => {
    window.history.replaceState({}, '', '/agent/preview?state=tool-running-open');
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: '任务输入' }), {
      target: { value: '优先补充制造业案例' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }));
    expect(screen.getByText('这是开发预览中的本地回复。')).toBeInTheDocument();
    expect(document.querySelector('.run-card')).not.toBeInTheDocument();
  });

  it('sends a production task and renders the model response', async () => {
    const session = {
      id: 'session-test',
      title: 'Compare two markets.',
      status: 'active',
      isPinned: false,
      createdAt: '2026-08-05T04:00:00.000Z',
      updatedAt: '2026-08-05T04:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const auth = authMeFetch(url);
        if (auth) return Promise.resolve(auth);
        if (url.endsWith('/api/agent/config/public'))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                defaultModel: 'deepseek-v4-pro',
                models: [
                  {
                    id: 'deepseek-v4-pro',
                    label: 'DeepSeek V4 Pro',
                    reasoning: {
                      supported: true,
                      levels: ['off', 'low', 'high', 'max'],
                      default: 'high',
                    },
                  },
                  {
                    id: 'deepseek-v4-flash',
                    label: 'DeepSeek V4 Flash',
                    reasoning: {
                      supported: true,
                      levels: ['off', 'low', 'high', 'max'],
                      default: 'high',
                    },
                  },
                ],
              }),
            ),
          );
        if (url.endsWith('/readyz')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ status: 'ok', service: 'hello-harness-api', version: '0.1.0' }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        if (url.endsWith('/api/agent/sessions') && !init?.method) {
          return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), { status: 200 }));
        }
        if (url.endsWith('/api/agent/sessions') && init?.method === 'POST') {
          return Promise.resolve(new Response(JSON.stringify({ session }), { status: 201 }));
        }
        if (url.endsWith('/session-test/runs') && init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                sessionId: 'session-test',
                runId: 'run-test',
                userMessageId: 'user-test',
                assistantMessageId: 'msg-test',
                status: 'queued',
                eventsUrl: '/api/agent/runs/run-test/events',
              }),
              { status: 201 },
            ),
          );
        }
        if (url.endsWith('/runs/run-test/events')) {
          return Promise.resolve(
            new Response(
              runFrame(
                'message.delta',
                {
                  type: 'message.delta',
                  messageId: 'msg-test',
                  blockId: 'text-1',
                  delta: '我先查询。',
                },
                1,
              ) +
                runFrame(
                  'tool.started',
                  {
                    type: 'tool.started',
                    messageId: 'msg-test',
                    blockId: 'tool-1',
                    toolCallId: 'call-1',
                    toolName: 'web_search',
                    title: '搜索网页',
                    input: { query: '两个市场最新数据' },
                    startedAt: '2026-08-05T04:00:01.000Z',
                  },
                  2,
                ) +
                runFrame(
                  'tool.completed',
                  {
                    type: 'tool.completed',
                    messageId: 'msg-test',
                    blockId: 'tool-1',
                    toolCallId: 'call-1',
                    toolName: 'web_search',
                    completedAt: '2026-08-05T04:00:02.000Z',
                    durationMs: 1000,
                    result: {
                      query: '两个市场最新数据',
                      provider: 'serp',
                      results: [
                        {
                          id: 'result-1',
                          title: '市场数据来源',
                          url: 'https://example.com/market',
                          domain: 'example.com',
                          snippet: '最新公开市场数据。',
                        },
                      ],
                    },
                  },
                  3,
                ) +
                runFrame(
                  'message.delta',
                  {
                    type: 'message.delta',
                    messageId: 'msg-test',
                    blockId: 'text-2',
                    delta: '你好，我已经',
                  },
                  4,
                ) +
                runFrame(
                  'message.delta',
                  {
                    type: 'message.delta',
                    messageId: 'msg-test',
                    blockId: 'text-2',
                    delta: '接入模型了。',
                  },
                  5,
                ) +
                runFrame('run.completed', { status: 'completed' }, 6),
              { status: 200, headers: { 'content-type': 'text/event-stream' } },
            ),
          );
        }
        if (url.endsWith('/title/generate')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ session: { ...session, title: '市场对比' }, generated: true }),
              { status: 200 },
            ),
          );
        }
        if (url.endsWith('/api/agent/sessions/session-test')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                session: {
                  ...session,
                  messages: [
                    {
                      id: 'user-test',
                      sessionId: session.id,
                      role: 'user',
                      kind: 'user_message',
                      content: 'Compare two markets.',
                      createdAt: session.createdAt,
                      metadata: {},
                    },
                    {
                      id: 'msg-test',
                      sessionId: session.id,
                      role: 'assistant',
                      kind: 'assistant_delivery',
                      content: '我先查询。你好，我已经接入模型了。',
                      createdAt: session.updatedAt,
                      metadata: {
                        model: 'test-model',
                        blocks: [
                          { id: 'text-1', type: 'text', content: '我先查询。' },
                          {
                            id: 'tool-1',
                            type: 'tool_activity',
                            toolCallId: 'call-1',
                            toolName: 'web_search',
                            status: 'completed',
                            title: '搜索网页',
                            summary: '找到 1 个结果',
                            startedAt: '2026-08-05T04:00:01.000Z',
                            completedAt: '2026-08-05T04:00:02.000Z',
                            durationMs: 1000,
                          },
                          { id: 'text-2', type: 'text', content: '你好，我已经接入模型了。' },
                        ],
                        agent: {
                          toolCallCount: 1,
                          executions: [
                            {
                              toolCallId: 'call-1',
                              toolName: 'web_search',
                              input: { query: '两个市场最新数据' },
                              status: 'completed',
                              startedAt: '2026-08-05T04:00:01.000Z',
                              completedAt: '2026-08-05T04:00:02.000Z',
                              durationMs: 1000,
                              resultCount: 1,
                            },
                          ],
                          sources: [
                            {
                              id: 'result-1',
                              kind: 'clue',
                              used: false,
                              title: '市场数据来源',
                              url: 'https://example.com/market',
                              domain: 'example.com',
                              snippet: '最新公开市场数据。',
                              provider: 'serp',
                              retrievedAt: '2026-08-05T04:00:02.000Z',
                              toolCallIds: ['call-1'],
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ sessions: [session] }), { status: 200 }),
        );
      }),
    );
    render(<App />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    await waitForProductionShell();
    fireEvent.change(screen.getByRole('textbox', { name: '任务输入' }), {
      target: { value: 'Compare two markets.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }));
    expect(screen.getByRole('textbox', { name: '任务输入' })).toHaveValue('');
    await waitFor(() => expect(screen.getByText('你好，我已经接入模型了。')).toBeInTheDocument());
    expect(screen.getByRole('complementary', { name: '工作区' })).toHaveClass('is-open');
    expect(screen.getByText('市场数据来源')).toBeInTheDocument();
    expect(screen.queryByText('思考过程')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '搜索：两个市场最新数据，已完成' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/agent/sessions/session-test/runs',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('creates a new session after entering draft mode instead of reusing the previous selection', async () => {
    const oldSession = {
      id: 'old-session',
      title: '旧会话',
      status: 'active',
      isPinned: false,
      createdAt: '2026-08-05T04:00:00.000Z',
      updatedAt: '2026-08-05T04:00:00.000Z',
    };
    const newSession = {
      ...oldSession,
      id: 'new-session',
      title: '新问题',
      updatedAt: '2026-08-05T04:10:00.000Z',
    };
    let created = false;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = authMeFetch(url);
      if (auth) return Promise.resolve(auth);
      if (url.endsWith('/api/agent/config/public'))
        return Promise.resolve(new Response(JSON.stringify(publicModelConfig)));
      if (url.endsWith('/readyz')) {
        return Promise.resolve(
          new Response(JSON.stringify({ status: 'ok', service: 'api', version: '0.1.0' })),
        );
      }
      if (url.endsWith('/api/agent/sessions') && init?.method === 'POST') {
        created = true;
        return Promise.resolve(
          new Response(JSON.stringify({ session: newSession }), { status: 201 }),
        );
      }
      if (url.endsWith('/api/agent/sessions') && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ sessions: created ? [newSession, oldSession] : [oldSession] }),
          ),
        );
      }
      if (url.endsWith('/old-session')) {
        return Promise.resolve(
          new Response(JSON.stringify({ session: { ...oldSession, messages: [] } })),
        );
      }
      if (url.endsWith('/new-session/runs') && init?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              sessionId: 'new-session',
              runId: 'new-run',
              userMessageId: 'new-user',
              assistantMessageId: 'new-message',
              status: 'queued',
              eventsUrl: '/api/agent/runs/new-run/events',
            }),
            { status: 201 },
          ),
        );
      }
      if (url.endsWith('/runs/new-run/events')) {
        return Promise.resolve(
          new Response(
            runFrame(
              'message.delta',
              {
                type: 'message.delta',
                messageId: 'new-message',
                blockId: 'text-1',
                delta: '新回答',
              },
              1,
              'new-run',
              'new-session',
            ) + runFrame('run.completed', { status: 'completed' }, 2, 'new-run', 'new-session'),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
        );
      }
      if (url.endsWith('/new-session/title/generate')) {
        return Promise.resolve(
          new Response(JSON.stringify({ session: newSession, generated: true })),
        );
      }
      if (url.endsWith('/new-session')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session: {
                ...newSession,
                messages: [
                  {
                    id: 'new-user',
                    sessionId: newSession.id,
                    role: 'user',
                    kind: 'user_message',
                    content: '新问题',
                    createdAt: newSession.createdAt,
                    metadata: {},
                  },
                  {
                    id: 'new-message',
                    sessionId: newSession.id,
                    role: 'assistant',
                    kind: 'assistant_delivery',
                    content: '新回答',
                    createdAt: newSession.updatedAt,
                    metadata: { model: 'test-model' },
                  },
                ],
              },
            }),
          ),
        );
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await waitForProductionShell();
    await waitFor(() => expect(screen.getByRole('button', { name: '旧会话' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    fireEvent.change(screen.getByRole('textbox', { name: '任务输入' }), {
      target: { value: '新问题' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }));
    await waitFor(() => expect(screen.getByText('新回答')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agent/sessions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agent/sessions/new-session/runs',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith('/old-session/runs')),
    ).toBe(false);
    expect(window.location.search).toBe('?session=new-session');
  });

  it('keeps draft selection when submit follows the new-session click immediately', async () => {
    const oldSession = {
      id: 'old-session',
      title: '旧会话',
      status: 'active',
      isPinned: false,
      createdAt: '2026-08-05T04:00:00.000Z',
      updatedAt: '2026-08-05T04:00:00.000Z',
    };
    const newSession = {
      ...oldSession,
      id: 'new-session',
      title: '立即提交',
      updatedAt: '2026-08-05T04:10:00.000Z',
    };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = authMeFetch(url);
      if (auth) return Promise.resolve(auth);
      if (url.endsWith('/api/agent/config/public'))
        return Promise.resolve(new Response(JSON.stringify(publicModelConfig)));
      if (url.endsWith('/readyz')) {
        return Promise.resolve(
          new Response(JSON.stringify({ status: 'ok', service: 'api', version: '0.1.0' })),
        );
      }
      if (url.endsWith('/api/agent/sessions') && init?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ session: newSession }), { status: 201 }),
        );
      }
      if (url.endsWith('/api/agent/sessions') && !init?.method) {
        return Promise.resolve(
          new Response(JSON.stringify({ sessions: [oldSession] }), { status: 200 }),
        );
      }
      if (url.endsWith('/old-session')) {
        return Promise.resolve(
          new Response(JSON.stringify({ session: { ...oldSession, messages: [] } })),
        );
      }
      if (url.endsWith('/new-session/runs') && init?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              sessionId: 'new-session',
              runId: 'new-run',
              userMessageId: 'new-user',
              assistantMessageId: 'new-message',
              status: 'queued',
              eventsUrl: '/api/agent/runs/new-run/events',
            }),
            { status: 201 },
          ),
        );
      }
      if (url.endsWith('/runs/new-run/events')) {
        return Promise.resolve(
          new Response(
            runFrame('run.completed', { status: 'completed' }, 1, 'new-run', 'new-session'),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
        );
      }
      if (url.endsWith('/new-session')) {
        return Promise.resolve(
          new Response(JSON.stringify({ session: { ...newSession, messages: [] } })),
        );
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await waitForProductionShell();
    await waitFor(() => expect(screen.getByRole('button', { name: '旧会话' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    fireEvent.change(screen.getByRole('textbox', { name: '任务输入' }), {
      target: { value: '立即提交' },
    });
    fireEvent.submit(screen.getByRole('textbox', { name: '任务输入' }).closest('form')!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agent/sessions/new-session/runs',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith('/old-session/runs')),
    ).toBe(false);
  });

  it('restores the URL-selected session and its persisted Markdown messages', async () => {
    const restored = {
      id: 'restored-session',
      title: '已恢复会话',
      status: 'active',
      isPinned: false,
      createdAt: '2026-08-05T04:00:00.000Z',
      updatedAt: '2026-08-05T04:10:00.000Z',
    };
    window.history.replaceState({}, '', '/agent?session=restored-session');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const auth = authMeFetch(url);
        if (auth) return Promise.resolve(auth);
        if (url.endsWith('/api/agent/config/public'))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                defaultModel: 'deepseek-v4-pro',
                models: [
                  {
                    id: 'deepseek-v4-pro',
                    label: 'DeepSeek V4 Pro',
                    reasoning: {
                      supported: true,
                      levels: ['off', 'low', 'high', 'max'],
                      default: 'high',
                    },
                  },
                ],
              }),
            ),
          );
        if (url.endsWith('/readyz')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                status: 'ok',
                service: 'hello-harness-api',
                version: '0.1.0',
              }),
              { status: 200 },
            ),
          );
        }
        if (url.endsWith('/api/agent/sessions/restored-session')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                session: {
                  ...restored,
                  messages: [
                    {
                      id: 'restored-user',
                      sessionId: restored.id,
                      role: 'user',
                      kind: 'user_message',
                      content: '**持久化问题**',
                      createdAt: restored.createdAt,
                      metadata: {},
                    },
                    {
                      id: 'restored-assistant',
                      runId: 'restored-run',
                      sessionId: restored.id,
                      role: 'assistant',
                      kind: 'assistant_delivery',
                      content: '这是刷新后恢复的回答。',
                      createdAt: restored.updatedAt,
                      metadata: {
                        model: 'test-model',
                        blocks: [
                          { id: 'restored-text-1', type: 'text', content: '我先检索。' },
                          {
                            id: 'restored-tool-1',
                            type: 'tool_activity',
                            toolCallId: 'restored-call',
                            toolName: 'web_search',
                            status: 'completed',
                            title: '搜索网页',
                            summary: '找到 1 个结果',
                            startedAt: '2026-08-05T04:09:58.000Z',
                            completedAt: '2026-08-05T04:09:59.000Z',
                            durationMs: 1000,
                          },
                          { id: 'restored-text-2', type: 'text', content: '这是刷新后恢复的回答。' },
                        ],
                        agent: {
                          toolCallCount: 1,
                          executions: [
                            {
                              toolCallId: 'restored-call',
                              toolName: 'web_search',
                              input: { query: '持久化检索' },
                              status: 'completed',
                              startedAt: '2026-08-05T04:09:58.000Z',
                              completedAt: '2026-08-05T04:09:59.000Z',
                              durationMs: 1000,
                              resultCount: 1,
                            },
                          ],
                          sources: [
                            {
                              id: 'restored-result',
                              kind: 'clue',
                              used: false,
                              title: '恢复后的来源',
                              url: 'https://example.com/restored',
                              domain: 'example.com',
                              snippet: '刷新后仍能查看。',
                              provider: 'bocha',
                              retrievedAt: '2026-08-05T04:09:59.000Z',
                              toolCallIds: ['restored-call'],
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              }),
              { status: 200 },
            ),
          );
        }
        if (url.endsWith('/api/agent/sessions')) {
          return Promise.resolve(
            new Response(JSON.stringify({ sessions: [restored] }), { status: 200 }),
          );
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      }),
    );

    render(<App />);
    await waitForProductionShell();
    await waitFor(() => expect(screen.getByText('这是刷新后恢复的回答。')).toBeInTheDocument());
    expect(window.location.search).toBe('?session=restored-session');
    expect(screen.queryByText('思考过程')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '工作区' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '搜索：持久化检索，已完成' }));
    expect(screen.getByRole('complementary', { name: '工作区' })).toHaveClass('is-open');
    expect(screen.getByText('持久化检索')).toBeInTheDocument();
  });

  it('recovers tools and legacy Steer blocks independently after refresh', async () => {
    const restored = {
      id: 'legacy-steer-session',
      title: '兼容旧 Steer 数据',
      status: 'active',
      isPinned: false,
      createdAt: '2026-08-05T04:00:00.000Z',
      updatedAt: '2026-08-05T04:10:00.000Z',
    };
    window.history.replaceState({}, '', '/agent?session=legacy-steer-session');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const auth = authMeFetch(url);
        if (auth) return Promise.resolve(auth);
        if (url.endsWith('/api/agent/config/public'))
          return Promise.resolve(new Response(JSON.stringify(publicModelConfig)));
        if (url.endsWith('/readyz'))
          return Promise.resolve(
            new Response(JSON.stringify({ status: 'ok', service: 'api', version: '0.1.0' })),
          );
        if (url.endsWith('/api/agent/sessions'))
          return Promise.resolve(new Response(JSON.stringify({ sessions: [restored] })));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session: {
                ...restored,
                messages: [
                  {
                    id: 'legacy-assistant',
                    sessionId: restored.id,
                    role: 'assistant',
                    kind: 'assistant_delivery',
                    content: '完整回答仍然存在。',
                    createdAt: restored.updatedAt,
                    metadata: {
                      model: 'test-model',
                      blocks: [
                        {
                          id: 'legacy-tool',
                          type: 'tool_activity',
                          toolCallId: 'call-1',
                          toolName: 'web_search',
                          status: 'completed',
                          title: '搜索网页',
                          startedAt: '2026-08-05T04:09:58.000Z',
                          completedAt: '2026-08-05T04:09:59.000Z',
                          durationMs: 1000,
                        },
                        {
                          id: 'legacy-intervention',
                          type: 'user.intervention',
                          inputId: 'input-1',
                          content: '重点关注科技板块',
                          roundId: 'round-2',
                          roundSequence: 2,
                          blockSequence: 0,
                        },
                        { id: 'legacy-text', type: 'text', content: '完整回答仍然存在。' },
                      ],
                    },
                  },
                ],
              },
            }),
          ),
        );
      }),
    );

    render(<App />);
    await waitForProductionShell();
    await waitFor(() => expect(screen.getByText('完整回答仍然存在。')).toBeInTheDocument());
    expect(screen.getByText('重点关注科技板块')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '搜索网页，已完成' })).toBeInTheDocument();
  });

  it('renames and pins a session through the compact overflow menu', async () => {
    const session = {
      id: 'editable-session',
      title: '原会话名称',
      status: 'active',
      isPinned: false,
      createdAt: '2026-08-05T04:00:00.000Z',
      updatedAt: '2026-08-05T04:10:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const auth = authMeFetch(url);
        if (auth) return Promise.resolve(auth);
        if (url.endsWith('/readyz')) {
          return Promise.resolve(
            new Response(JSON.stringify({ status: 'ok', service: 'api', version: '0.1.0' }), {
              status: 200,
            }),
          );
        }
        if (url.endsWith('/api/agent/sessions') && !init?.method) {
          return Promise.resolve(
            new Response(JSON.stringify({ sessions: [session] }), { status: 200 }),
          );
        }
        if (init?.method === 'PATCH') {
          const update = JSON.parse(String(init.body)) as { title?: string; isPinned?: boolean };
          Object.assign(session, update, { updatedAt: '2026-08-05T04:20:00.000Z' });
          return Promise.resolve(new Response(JSON.stringify({ session }), { status: 200 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ session: { ...session, messages: [] } }), { status: 200 }),
        );
      }),
    );

    render(<App />);
    await waitForProductionShell();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '原会话名称' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('menuitem', { name: '删除' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更多操作 原会话名称' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }));
    fireEvent.change(screen.getByRole('textbox', { name: '会话名称' }), {
      target: { value: '新的会话名称' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '新的会话名称' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作 新的会话名称' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/agent/sessions/editable-session',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isPinned: true }) }),
      ),
    );
  });

  it('does not overwrite a background stream when switching away and back', async () => {
    const baseTime = '2026-08-05T04:00:00.000Z';
    const sessionA = {
      id: 'session-a',
      title: '会话 A',
      status: 'active',
      isPinned: false,
      createdAt: baseTime,
      updatedAt: baseTime,
    };
    const sessionB = {
      id: 'session-b',
      title: '会话 B',
      status: 'active',
      isPinned: false,
      createdAt: baseTime,
      updatedAt: baseTime,
    };
    // 手动控制后台 SSE 完成时机，复现流式生成期间切换会话的竞态。
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    let streamCompleted = false;
    // 记录会话 A 的详情请求次数，验证切回时先复用缓存、完成后再校准持久化结果。
    let sessionADetailCalls = 0;
    const encoder = new TextEncoder();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        const auth = authMeFetch(url);
        if (auth) return Promise.resolve(auth);
        if (url.endsWith('/api/agent/config/public'))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                defaultModel: 'deepseek-v4-pro',
                models: [
                  {
                    id: 'deepseek-v4-pro',
                    label: 'DeepSeek V4 Pro',
                    reasoning: {
                      supported: true,
                      levels: ['off', 'low', 'high', 'max'],
                      default: 'high',
                    },
                  },
                ],
              }),
            ),
          );
        if (url.endsWith('/readyz')) {
          return Promise.resolve(
            new Response(JSON.stringify({ status: 'ok', service: 'api', version: '0.1.0' }), {
              status: 200,
            }),
          );
        }
        if (url.endsWith('/api/agent/sessions')) {
          return Promise.resolve(
            new Response(JSON.stringify({ sessions: [sessionA, sessionB] }), { status: 200 }),
          );
        }
        if (url.endsWith('/session-a/runs')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                sessionId: 'session-a',
                runId: 'run-a',
                userMessageId: 'user-a',
                assistantMessageId: 'assistant-a',
                status: 'queued',
                eventsUrl: '/api/agent/runs/run-a/events',
              }),
              { status: 201 },
            ),
          );
        }
        if (url.endsWith('/runs/run-a/events')) {
          return Promise.resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  streamController = controller;
                },
              }),
              { status: 200, headers: { 'content-type': 'text/event-stream' } },
            ),
          );
        }
        if (url.endsWith('/title/generate')) {
          return Promise.resolve(
            new Response(JSON.stringify({ session: sessionA, generated: false }), { status: 200 }),
          );
        }
        const session = url.endsWith('/session-b') ? sessionB : sessionA;
        if (session.id === 'session-a') sessionADetailCalls += 1;
        const messages =
          streamCompleted && session.id === 'session-a'
            ? [
                {
                  id: 'user-a',
                  sessionId: session.id,
                  role: 'user',
                  kind: 'user_message',
                  content: '后台问题',
                  createdAt: baseTime,
                  metadata: {},
                },
                {
                  id: 'assistant-a',
                  sessionId: session.id,
                  role: 'assistant',
                  kind: 'assistant_delivery',
                  content: '后台完整回答',
                  createdAt: baseTime,
                  metadata: {},
                },
              ]
            : [];
        return Promise.resolve(
          new Response(JSON.stringify({ session: { ...session, messages } }), { status: 200 }),
        );
      }),
    );

    render(<App />);
    await waitForProductionShell();
    await waitFor(() => expect(sessionADetailCalls).toBe(1));
    fireEvent.change(screen.getByRole('textbox', { name: '任务输入' }), {
      target: { value: '后台问题' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }));
    await waitFor(() => expect(streamController).toBeDefined());
    streamController?.enqueue(
      encoder.encode(
        runFrame(
          'message.delta',
          {
            type: 'message.delta',
            messageId: 'assistant-a',
            blockId: 'assistant-a-text-1',
            delta: '后台',
          },
          1,
          'run-a',
          'session-a',
        ),
      ),
    );
    await waitFor(() => expect(screen.getByText('后台')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^会话 B/ }));
    fireEvent.click(screen.getByRole('button', { name: /^会话 A/ }));
    await waitFor(() => expect(screen.getByText('后台')).toBeInTheDocument());
    expect(sessionADetailCalls).toBe(1);

    streamCompleted = true;
    streamController?.enqueue(
      encoder.encode(
        runFrame(
          'message.delta',
          {
            type: 'message.delta',
            messageId: 'assistant-a',
            blockId: 'assistant-a-text-1',
            delta: '完整回答',
          },
          2,
          'run-a',
          'session-a',
        ) + runFrame('run.completed', { status: 'completed' }, 3, 'run-a', 'session-a'),
      ),
    );
    streamController?.close();
    await waitFor(() => expect(screen.getByText('后台完整回答')).toBeInTheDocument());
    expect(sessionADetailCalls).toBe(2);
  });
});
