import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App, AppShell } from './app';
import { Composer } from './features/agent/components/conversation';

function mockReady() {
  // 为组件测试提供稳定的 API 就绪响应。
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/agent/sessions')
        ? { sessions: [] }
        : {
            status: 'ok',
            service: 'hello-harness-api',
            version: '0.1.0',
            checks: { database: 'ok', artifactStore: 'ok' },
          };
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

  it('renders the production empty state without an empty workbench', async () => {
    render(<App />);
    expect(screen.getByText('Harness')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '任务输入' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '工作区' })).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
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

  it('renders sources and report in the development fixture preview', () => {
    render(
      <AppShell
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

  it('exposes a mock state switcher on the preview route', () => {
    window.history.replaceState({}, '', '/agent/preview?state=waiting');
    render(<App />);
    expect(screen.getByRole('navigation', { name: '预览状态' })).toBeInTheDocument();
    expect(screen.getByText('等待你的确认')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '最终报告' })).toHaveAttribute(
      'href',
      '/agent/preview?state=final-report',
    );
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

  it('opens the workbench from an inline tool activity and pins the selected call', () => {
    window.history.replaceState({}, '', '/agent/preview?state=tool-running');
    render(<App />);
    expect(screen.queryByRole('complementary', { name: '工作区' })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-label="工作区"]')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: '搜索网页，执行中' }));
    expect(screen.getByRole('complementary', { name: '工作区' })).toHaveClass('is-open');
    expect(screen.getByText('已固定')).toBeInTheDocument();
    expect(screen.getByText('业务输入')).toBeInTheDocument();
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
        if (url.endsWith('/chat/stream')) {
          return Promise.resolve(
            new Response(
              'data: {"type":"message.delta","messageId":"msg-test","blockId":"text-1","delta":"我先查询。"}\n\n' +
                'data: {"type":"tool.started","messageId":"msg-test","blockId":"tool-1","toolCallId":"call-1","toolName":"web_search","title":"搜索网页","input":{"query":"两个市场最新数据"},"startedAt":"2026-08-05T04:00:01.000Z"}\n\n' +
                'data: {"type":"tool.completed","messageId":"msg-test","blockId":"tool-1","toolCallId":"call-1","toolName":"web_search","completedAt":"2026-08-05T04:00:02.000Z","durationMs":1000,"result":{"query":"两个市场最新数据","provider":"serp","results":[{"id":"result-1","title":"市场数据来源","url":"https://example.com/market","domain":"example.com","snippet":"最新公开市场数据。"}]}}\n\n' +
                'data: {"type":"message.delta","messageId":"msg-test","blockId":"text-2","delta":"你好，我已经"}\n\ndata: {"type":"message.delta","messageId":"msg-test","blockId":"text-2","delta":"接入模型了。"}\n\ndata: {"type":"message.completed","messageId":"msg-test","model":"test-model"}\n\n',
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
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByRole('textbox', { name: '任务输入' }), {
      target: { value: 'Compare two markets.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }));
    expect(screen.getByRole('textbox', { name: '任务输入' })).toHaveValue('');
    await waitFor(() => expect(screen.getByText('你好，我已经接入模型了。')).toBeInTheDocument());
    expect(screen.getByRole('complementary', { name: '工作区' })).toHaveClass('is-open');
    expect(screen.getByText('市场数据来源')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '搜索网页，已完成' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/agent/sessions/session-test/chat/stream',
      expect.objectContaining({
        body: JSON.stringify({ content: 'Compare two markets.' }),
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
      if (url.endsWith('/new-session/chat/stream')) {
        return Promise.resolve(
          new Response(
            'data: {"type":"message.delta","messageId":"new-message","blockId":"text-1","delta":"新回答"}\n\n' +
              'data: {"type":"message.completed","messageId":"new-message","model":"test-model"}\n\n',
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
      '/api/agent/sessions/new-session/chat/stream',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith('/old-session/chat/stream')),
    ).toBe(false);
    expect(window.location.search).toBe('?session=new-session');
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
        if (url.endsWith('/api/agent/sessions')) {
          return Promise.resolve(
            new Response(JSON.stringify({ sessions: [restored] }), { status: 200 }),
          );
        }
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
      }),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText('这是刷新后恢复的回答。')).toBeInTheDocument());
    expect(screen.getByText('持久化问题').tagName).toBe('STRONG');
    expect(window.location.search).toBe('?session=restored-session');
    fireEvent.click(screen.getByRole('button', { name: '搜索网页，已完成' }));
    expect(screen.getByText('持久化检索')).toBeInTheDocument();
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
        if (url.endsWith('/session-a/chat/stream')) {
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
    await waitFor(() => expect(sessionADetailCalls).toBe(1));
    fireEvent.change(screen.getByRole('textbox', { name: '任务输入' }), {
      target: { value: '后台问题' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }));
    await waitFor(() => expect(streamController).toBeDefined());
    streamController?.enqueue(
      encoder.encode(
        'data: {"type":"message.delta","messageId":"assistant-a","blockId":"assistant-a-text-1","delta":"后台"}\n\n',
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
        'data: {"type":"message.delta","messageId":"assistant-a","blockId":"assistant-a-text-1","delta":"完整回答"}\n\ndata: {"type":"message.completed","messageId":"assistant-a","model":"test-model"}\n\n',
      ),
    );
    streamController?.close();
    await waitFor(() => expect(screen.getByText('后台完整回答')).toBeInTheDocument());
    expect(sessionADetailCalls).toBe(2);
  });
});
