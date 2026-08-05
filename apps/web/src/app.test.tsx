import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App, AppShell } from './app';

function mockReady() {
  // 为组件测试提供稳定的 API 就绪响应。
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'hello-harness-api',
          version: '0.1.0',
          checks: { database: 'ok', artifactStore: 'ok' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
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
    await waitFor(() => expect(screen.getAllByText('服务已就绪')).toHaveLength(1));
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

  it('opens the workbench from a run card and pins the selected tool call', () => {
    window.history.replaceState({}, '', '/agent/preview?state=tool-running');
    render(<App />);
    expect(screen.queryByRole('complementary', { name: '工作区' })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-label="工作区"]')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: '打开 检索中 的工作台' }));
    expect(screen.getByRole('complementary', { name: '工作区' })).toHaveClass('is-open');
    expect(screen.getByText('已固定')).toBeInTheDocument();
    expect(screen.getByText('业务输入')).toBeInTheDocument();
  });

  it('submits running input as steer without creating a new run', () => {
    window.history.replaceState({}, '', '/agent/preview?state=tool-running-open');
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: '任务输入' }), {
      target: { value: '优先补充制造业案例' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }));
    expect(screen.getByText('已接受调整，将从下一步骤应用。')).toBeInTheDocument();
    expect(screen.getAllByText('作为调整提交 · 下一步骤生效')).toHaveLength(1);
  });

  it('sends a production task and renders the model response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'ok', service: 'hello-harness-api', version: '0.1.0' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            'data: {"type":"message.delta","messageId":"msg-test","delta":"你好，我已经"}\n\ndata: {"type":"message.delta","messageId":"msg-test","delta":"接入模型了。"}\n\ndata: {"type":"message.completed","messageId":"msg-test","model":"test-model"}\n\n',
            { status: 200, headers: { 'content-type': 'text/event-stream' } },
          ),
        ),
    );
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('服务已就绪')).toHaveLength(1));
    fireEvent.change(screen.getByRole('textbox', { name: '任务输入' }), {
      target: { value: 'Compare two markets.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送任务' }));
    expect(screen.getByRole('textbox', { name: '任务输入' })).toHaveValue('');
    await waitFor(() => expect(screen.getByText('你好，我已经接入模型了。')).toBeInTheDocument());
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/agent/chat/stream',
      expect.objectContaining({
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Compare two markets.' }] }),
      }),
    );
  });
});
