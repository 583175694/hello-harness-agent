import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkbenchShell } from './workbench-views';

describe('Workbench context view', () => {
  it('keeps artifact preview and download actions in the workbench', () => {
    render(
      <WorkbenchShell
        state={{
          runId: 'run-1',
          title: '执行详情',
          subtitle: '当前运行',
          activeView: 'artifact',
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

    expect(screen.getByRole('link', { name: '预览' })).toHaveAttribute(
      'href',
      '/api/agent/artifacts/artifact-1/preview',
    );
    expect(screen.getByRole('button', { name: '下载' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('renders immutable version history and confirms revise and restore actions', () => {
    const onReviseArtifact = vi.fn();
    const onRestoreArtifact = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
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

    render(
      <WorkbenchShell
        state={{
          runId: 'run-version-2',
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

    expect(screen.getAllByText('result.md')).toHaveLength(2);
    expect(screen.getByText('v1')).toBeVisible();
    expect(screen.getByText('v2')).toBeVisible();
    expect(screen.getByText('当前版本')).toBeVisible();
    expect(screen.getByText('修改')).toBeVisible();
    expect(screen.queryByText('补充第二节')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '预览' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '下载' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: '基于此版本修改' })[0]!);
    expect(onReviseArtifact).toHaveBeenCalledWith(versions[0]);
    fireEvent.click(screen.getByRole('button', { name: '恢复此版本' }));
    expect(confirm).toHaveBeenCalledWith('确认将 v1 恢复为新的最新版本？');
    expect(onRestoreArtifact).toHaveBeenCalledWith(versions[0]);
    confirm.mockRestore();
  });

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

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(onViewChange).toHaveBeenCalledWith('activity');
  });
});
