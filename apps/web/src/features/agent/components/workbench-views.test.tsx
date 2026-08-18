import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkbenchShell } from './workbench-views';

describe('Workbench context view', () => {
  it('keeps the Context tab visible before the current Run has context data', () => {
    render(
      <WorkbenchShell
        state={{
          runId: 'run-1',
          title: '执行详情',
          subtitle: '当前运行',
          activeView: 'context',
          activityStatus: 'completed',
          executions: [],
          followMode: 'auto',
          sources: [],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Context' })).toBeVisible();
    expect(screen.getByText('当前 Run 尚无 Context')).toBeVisible();
  });

  it('renders the latest compiled model context as formatted JSON', () => {
    const onViewChange = vi.fn();
    render(
      <WorkbenchShell
        state={{
          runId: 'run-1',
          title: '执行详情',
          subtitle: '当前运行',
          activeView: 'context',
          activityStatus: 'running',
          executions: [],
          followMode: 'auto',
          sources: [],
          open: true,
          context: {
            version: 1,
            roundSequence: 2,
            attempt: 1,
            estimatedInputTokens: 842,
            promptBudget: 116_326,
            compactionTriggered: false,
            finalResponseOnly: true,
            messages: [{ role: 'user', content: '你好' }],
            tools: [],
          },
        }}
        onClose={() => undefined}
        onViewChange={onViewChange}
        onExecutionSelect={() => undefined}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Context' })).toBeVisible();
    expect(screen.getByText('Model Round 2')).toBeVisible();
    expect(screen.getByText('"estimatedInputTokens"')).toBeVisible();
    expect(screen.getByText('842')).toBeVisible();
    expect(screen.getByText('"content"')).toBeVisible();
    expect(screen.getByText('"你好"')).toBeVisible();
    expect(screen.getByText('"estimatedInputTokens"')).toHaveClass('json-token--key');

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(onViewChange).toHaveBeenCalledWith('activity');
  });
});
