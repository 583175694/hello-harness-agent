import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Conversation } from './conversation';

describe('Conversation tool activity navigation', () => {
  it('selects model and closes the settings popover when clicking outside', async () => {
    const onModelChange = vi.fn();
    render(
      <Conversation
        state={{ label: 'test', subtitle: '', conversation: [] }}
        error={null}
        onDismissError={() => undefined}
        onFocusWorkbench={() => undefined}
        prompt=""
        submitting={false}
        serviceState="ready"
        composerMode="new-run"
        models={[
          {
            id: 'deepseek-v4-flash',
            label: 'DeepSeek V4 Flash',
            reasoning: {
              supported: true,
              levels: ['off', 'low', 'high', 'max'],
              default: 'high',
            },
          },
          {
            id: 'deepseek-v4-pro',
            label: 'DeepSeek V4 Pro',
            reasoning: {
              supported: true,
              levels: ['off', 'low', 'high', 'max'],
              default: 'high',
            },
          },
        ]}
        selectedModel="deepseek-v4-flash"
        reasoningEffort="high"
        onModelChange={onModelChange}
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'DeepSeek V4 Flash 中' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'DeepSeek V4 Pro' }));
    expect(onModelChange).toHaveBeenCalledWith('deepseek-v4-pro');

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('hides legacy reasoning and renders text/tool blocks in canonical order without folding', () => {
    const { container } = render(
      <Conversation
        state={{
          label: 'test',
          subtitle: '',
          conversation: [
            {
              id: 'assistant-1',
              kind: 'assistant',
              pending: false,
              deliveryStatus: 'completed',
              blocks: [
                {
                  id: 'reasoning-1',
                  type: 'reasoning',
                  content: '这是已经完成的思考过程。',
                  roundId: 'round-1',
                  roundSequence: 1,
                  blockSequence: 0,
                },
                {
                  id: 'preamble-1',
                  type: 'text',
                  content: '我先搜索。',
                  roundId: 'round-1',
                  roundSequence: 1,
                  blockSequence: 1,
                },
                {
                  id: 'tool-1',
                  type: 'tool_activity',
                  toolCallId: 'call-1',
                  toolName: 'web_search',
                  status: 'completed',
                  title: '搜索网页',
                  startedAt: '2026-08-12T09:00:00.000Z',
                  completedAt: '2026-08-12T09:00:01.000Z',
                  roundId: 'round-1',
                  roundSequence: 1,
                  blockSequence: 2,
                },
                {
                  id: 'text-final',
                  type: 'text',
                  content: '这是最终回答。',
                  roundId: 'round-2',
                  roundSequence: 2,
                  blockSequence: 0,
                },
              ],
            },
          ],
        }}
        error={null}
        onDismissError={() => undefined}
        onFocusWorkbench={() => undefined}
        prompt=""
        submitting={false}
        serviceState="ready"
        composerMode="new-run"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(screen.queryByText('思考过程')).not.toBeInTheDocument();
    expect(screen.queryByText('这是已经完成的思考过程。')).not.toBeInTheDocument();
    expect(screen.getByText('这是最终回答。')).toBeInTheDocument();
    const blocks = [...container.querySelectorAll('.assistant-blocks > *')];
    expect(blocks.map((block) => block.textContent)).toEqual([
      '我先搜索。',
      expect.stringContaining('搜索网页'),
      '这是最终回答。',
    ]);
    expect(container.querySelector('details')).toBeNull();
  });

  it('hides the generic thinking status once a tool is visible', () => {
    render(
      <Conversation
        state={{
          label: 'test',
          subtitle: '',
          conversation: [
            {
              id: 'assistant-1',
              kind: 'assistant',
              pending: true,
              blocks: [
                {
                  id: 'tool-1',
                  type: 'tool_activity',
                  toolCallId: 'call-1',
                  toolName: 'web_search',
                  status: 'running',
                  title: '搜索网页',
                  startedAt: '2026-08-12T09:00:00.000Z',
                },
              ],
            },
          ],
        }}
        error={null}
        onDismissError={() => undefined}
        onFocusWorkbench={() => undefined}
        prompt=""
        submitting
        serviceState="ready"
        composerMode="new-run"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(screen.queryByText('正在思考中…')).not.toBeInTheDocument();
    expect(screen.getByText('AI 正在回复')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '停止任务' })).toBeInTheDocument();
  });

  it('shows the generic thinking status on the latest empty assistant while submitting', () => {
    render(
      <Conversation
        state={{
          label: 'test',
          subtitle: '',
          conversation: [
            {
              id: 'assistant-1',
              kind: 'assistant',
              pending: false,
              blocks: [{ id: 'text-1', type: 'text', content: '上一轮回答。' }],
            },
            { id: 'user-2', kind: 'user', content: '继续。' },
            { id: 'assistant-2', kind: 'assistant', pending: false, blocks: [] },
          ],
        }}
        error={null}
        onDismissError={() => undefined}
        onFocusWorkbench={() => undefined}
        prompt=""
        submitting
        serviceState="ready"
        composerMode="new-run"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(screen.getByText('正在思考中…')).toBeInTheDocument();
    expect(screen.getByText('AI 正在回复')).toBeInTheDocument();
  });

  it('uses the server message identity while the assistant still has an optimistic id', () => {
    const onFocusWorkbench = vi.fn();
    render(
      <Conversation
        state={{
          label: 'test',
          subtitle: '',
          conversation: [
            {
              id: 'local-assistant-1',
              kind: 'assistant',
              pending: true,
              blocks: [
                {
                  id: 'server-message-1-tool-call-1',
                  type: 'tool_activity',
                  toolCallId: 'call-1',
                  toolName: 'web_search',
                  status: 'running',
                  title: '搜索网页',
                  summary: '测试查询',
                  startedAt: '2026-08-07T09:00:00.000Z',
                  durationMs: 167,
                },
              ],
              workbench: {
                runId: 'server-message-1',
                title: '网页检索',
                subtitle: '执行中',
                activeView: 'activity',
                executions: [],
                followMode: 'auto',
                sources: [],
                open: true,
              },
            },
          ],
        }}
        error={null}
        onDismissError={() => undefined}
        onFocusWorkbench={onFocusWorkbench}
        prompt=""
        submitting
        serviceState="ready"
        composerMode="new-run"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '搜索网页，执行中' }));
    expect(screen.queryByText(/毫秒|秒$/)).not.toBeInTheDocument();
    expect(onFocusWorkbench).toHaveBeenCalledWith({
      kind: 'tool_call',
      runId: 'server-message-1',
      stepId: 'call-1',
      toolCallId: 'call-1',
    });
  });
});
