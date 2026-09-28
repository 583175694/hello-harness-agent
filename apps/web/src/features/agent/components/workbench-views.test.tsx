import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmProvider } from '../../../components/ui/confirm-provider';
import { WorkbenchShell } from './workbench-views';

function renderWorkbench(ui: ReactElement) {
  return render(<ConfirmProvider>{ui}</ConfirmProvider>);
}

describe('Workbench context view', () => {
  it('keeps artifact preview and download actions in the workbench', () => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-1',
          title: '执行详情',
          subtitle: '当前运行',
          activeView: 'deliverables',
          activityStatus: 'completed',
          executions: [],
          followMode: 'auto',
          sources: [],
          artifacts: [
            {
              artifactId: 'artifact-1',
              fileId: 'file-1',
              fileName: 'result.md',
              mediaType: 'text/markdown',
              fileKind: 'markdown',
              size: 1024,
              status: 'ready',
              createdAt: '2026-09-10T00:00:00.000Z',
            },
          ],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    expect(screen.getByRole('link', { name: '在新窗口打开' })).toHaveAttribute(
      'href',
      '/api/agent/artifacts/artifact-1/preview',
    );
    expect(screen.getByRole('button', { name: '下载' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('renders immutable version history and confirms revise and restore actions', async () => {
    const onReviseArtifact = vi.fn();
    const onRestoreArtifact = vi.fn();
    const versions = [
      {
        artifactId: 'artifact-1',
        fileId: 'file-1',
        fileName: 'result.md',
        mediaType: 'text/markdown',
        fileKind: 'markdown' as const,
        size: 12,
        status: 'ready' as const,
        createdAt: '2026-09-10T00:00:00.000Z',
        seriesId: 'series-1',
        logicalName: 'result.md',
        versionNumber: 1,
        runId: 'run-version-1',
        operation: 'create' as const,
        isCurrent: false,
      },
      {
        artifactId: 'artifact-2',
        fileId: 'file-2',
        fileName: 'result.md',
        mediaType: 'text/markdown',
        fileKind: 'markdown' as const,
        size: 24,
        status: 'ready' as const,
        createdAt: '2026-09-10T01:00:00.000Z',
        seriesId: 'series-1',
        logicalName: 'result.md',
        versionNumber: 2,
        runId: 'run-version-2',
        operation: 'revise' as const,
        isCurrent: true,
        parentArtifactId: 'artifact-1',
        changeSummary: '补充第二节',
      },
    ];

    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-version-2',
          title: '执行详情',
          subtitle: '当前运行',
          activeView: 'deliverables',
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
              versions,
            },
          ],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
        onReviseArtifact={onReviseArtifact}
        onRestoreArtifact={onRestoreArtifact}
      />,
    );

    expect(screen.getAllByText('result.md').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'v1' })).toBeVisible();
    expect(screen.getByRole('tab', { name: /v2/ })).toBeVisible();
    expect(screen.getByText('当前版本')).toBeVisible();
    expect(screen.getByText('修改')).toBeVisible();
    expect(screen.queryByText('补充第二节')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'v1' }));
    fireEvent.click(screen.getByRole('button', { name: '基于此版本修改' }));
    expect(onReviseArtifact).toHaveBeenCalledWith(versions[0]);

    fireEvent.click(screen.getByRole('button', { name: '恢复此版本' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '恢复' }));
    await waitFor(() => expect(onRestoreArtifact).toHaveBeenCalledWith(versions[0]));
  });

  it('keeps the Context tab visible before the current Run has context data', () => {
    renderWorkbench(
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
    renderWorkbench(
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
            promptBudget: 566_000,
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

    fireEvent.click(screen.getByRole('tab', { name: '工具结果' }));
    expect(onViewChange).toHaveBeenCalledWith('tool_results');
  });
});
