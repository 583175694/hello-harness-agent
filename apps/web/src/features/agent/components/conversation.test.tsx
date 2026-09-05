import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Composer, Conversation } from './conversation';

describe('Composer image paste', () => {
  it('routes clipboard images through the attachment callback', () => {
    const onAttachmentSelected = vi.fn();
    render(
      <Composer
        prompt=""
        submitting={false}
        serviceState="ready"
        mode="new-run"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        onAttachmentSelected={onAttachmentSelected}
      />,
    );
    const image = new File(['image'], 'clip.png', { type: 'image/png' });
    fireEvent.paste(screen.getByRole('textbox', { name: '任务输入' }), {
      clipboardData: { files: [image] },
    });
    expect(onAttachmentSelected).toHaveBeenCalledWith([image]);
  });

  it('routes multiple selected images in their input order', () => {
    const onAttachmentSelected = vi.fn();
    render(
      <Composer
        prompt=""
        submitting={false}
        serviceState="ready"
        mode="new-run"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        onAttachmentSelected={onAttachmentSelected}
      />,
    );
    const first = new File(['one'], 'one.png', { type: 'image/png' });
    const second = new File(['two'], 'two.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]');
    expect(input).toHaveAttribute('multiple');
    fireEvent.change(input as HTMLInputElement, { target: { files: [first, second] } });
    expect(onAttachmentSelected).toHaveBeenCalledWith([first, second]);
  });

  it('opens the thumbnail that was selected', () => {
    render(
      <Composer
        prompt=""
        submitting={false}
        serviceState="ready"
        mode="new-run"
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        attachments={[
          {
            fileId: 'file-1',
            fileName: 'one.png',
            mediaType: 'image/png',
            size: 1,
            width: 1,
            height: 1,
            status: 'ready',
            previewUrl: '/one.png',
          },
          {
            fileId: 'file-2',
            fileName: 'two.png',
            mediaType: 'image/png',
            size: 1,
            width: 1,
            height: 1,
            status: 'ready',
            previewUrl: '/two.png',
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '预览two.png' }));
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute('src', '/two.png');
  });

  it('does not intercept plain text paste', () => {
    const onAttachmentSelected = vi.fn();
    const onPromptChange = vi.fn();
    render(
      <Composer
        prompt=""
        submitting={false}
        serviceState="ready"
        mode="new-run"
        onPromptChange={onPromptChange}
        onSubmit={() => undefined}
        onAttachmentSelected={onAttachmentSelected}
      />,
    );
    fireEvent.paste(screen.getByRole('textbox', { name: '任务输入' }), {
      clipboardData: { files: [], getData: () => '普通文本' },
    });
    expect(onAttachmentSelected).not.toHaveBeenCalled();
  });
});

describe('Conversation tool activity navigation', () => {
  it('renders a consumed steer as the regular user message', () => {
    render(
      <Conversation
        state={{
          label: 'test',
          subtitle: '',
          conversation: [
            {
              id: 'assistant-1',
              kind: 'assistant',
              blocks: [
                {
                  id: 'text-1',
                  type: 'text',
                  content: '前文',
                  roundId: 'round-1',
                  roundSequence: 1,
                  blockSequence: 0,
                },
                {
                  id: 'intervention-1',
                  type: 'user_intervention',
                  inputId: 'input-1',
                  content: '重点关注机器人板块',
                  roundId: 'round-2',
                  roundSequence: 2,
                  blockSequence: 0,
                },
                {
                  id: 'text-2',
                  type: 'text',
                  content: '后文',
                  roundId: 'round-2',
                  roundSequence: 2,
                  blockSequence: 1,
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
    expect(screen.getByText('重点关注机器人板块')).toBeInTheDocument();
    expect(screen.getByText('已应用到当前任务')).toBeInTheDocument();
  });

  it('submits a clarification answer from the active interrupt', () => {
    const respond = vi.fn();
    render(
      <Conversation
        state={{
          label: 'test',
          subtitle: '',
          conversation: [],
          activeInterrupt: {
            interruptId: 'interrupt-1',
            runId: 'run-1',
            kind: 'clarification',
            status: 'pending',
            createdAt: '2026-08-21T00:00:00.000Z',
            roundId: 'round-1',
            roundSequence: 1,
            payload: {
              question: '使用哪个环境？',
              options: ['测试', '生产'],
              allowFreeText: false,
            },
          },
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
        onClarificationRespond={respond}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '测试' }));
    fireEvent.click(screen.getByRole('button', { name: '提交回答' }));
    expect(respond).toHaveBeenCalledWith('interrupt-1', '测试');
    expect(screen.getByRole('button', { name: '正在提交回答' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '测试' })).toBeDisabled();
  });

  it('cancels a clarification interrupt from the header close button', () => {
    const cancel = vi.fn();
    render(
      <Conversation
        state={{
          label: 'test',
          subtitle: '',
          conversation: [],
          activeInterrupt: {
            interruptId: 'interrupt-cancel-1',
            runId: 'run-1',
            kind: 'clarification',
            status: 'pending',
            createdAt: '2026-08-21T00:00:00.000Z',
            roundId: 'round-1',
            roundSequence: 1,
            payload: {
              question: '使用哪个环境？',
              options: ['测试', '生产'],
              allowFreeText: false,
            },
          },
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
        onCancel={cancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '取消当前任务' }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('submits approval immediately from the aligned action group', () => {
    const submit = vi.fn();
    const cancel = vi.fn();
    render(
      <Conversation
        state={{
          label: 'test',
          subtitle: '',
          conversation: [],
          activeInterrupt: {
            interruptId: 'interrupt-2',
            runId: 'run-1',
            kind: 'tool_approval',
            status: 'pending',
            createdAt: '2026-08-21T00:00:00.000Z',
            roundId: 'round-1',
            roundSequence: 1,
            payload: {
              items: [
                {
                  itemId: 'one',
                  toolCallId: 'call-1',
                  toolName: 'approval_test',
                  input: { message: 'one' },
                  argumentsHash: 'h1',
                },
              ],
            },
          },
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
        onApprovalSubmit={submit}
        onCancel={cancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '取消当前任务' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '批准' }));
    expect(submit).toHaveBeenCalledWith('interrupt-2', [
      expect.objectContaining({ itemId: 'one', decision: 'approve' }),
    ]);
    expect(screen.queryByRole('button', { name: '提交审批' })).not.toBeInTheDocument();
  });

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
    expect(screen.getByRole('status', { name: 'AI 正在回复' })).toBeInTheDocument();
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
    expect(screen.getByRole('status', { name: 'AI 正在回复' })).toBeInTheDocument();
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
