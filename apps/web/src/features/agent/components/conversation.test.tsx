import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Conversation } from './conversation';

describe('Conversation tool activity navigation', () => {
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
