import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRef } from '@harness/agent-protocol';

import { ConfirmProvider } from '../../../components/ui/confirm-provider';
import { AGENT_UI_COPY } from '../config/ui.constants';
import { WorkbenchShell, workbenchAsideAriaLabel } from './workbench-views';

vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/client')>();
  return {
    ...actual,
    getArtifactPreview: vi.fn(async () => ({
      artifactId: 'artifact-1',
      content: '# Preview\n\nHello',
      contentType: 'text/markdown',
    })),
    loadArtifactPreviewImageObjectUrl: vi.fn(async () => 'blob:mock-image-preview'),
  };
});

function renderWorkbench(ui: ReactElement) {
  return render(<ConfirmProvider>{ui}</ConfirmProvider>);
}

describe('Workbench context view', () => {
  it('derives aside aria-label from the active tab', () => {
    expect(
      workbenchAsideAriaLabel({ activeView: 'deliverables', title: '网页检索' }),
    ).toBe('文件 · 网页检索');
    expect(workbenchAsideAriaLabel({ activeView: 'context', title: '' })).toBe('Context');
  });

  it('shows follow pin and resume when the user pinned an older step', () => {
    const onResumeAutoFollow = vi.fn();
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-1',
          title: '网页检索',
          subtitle: '2 次调用',
          activeView: 'tool_results',
          activityStatus: 'running',
          followMode: 'pinned',
          executions: [
            {
              toolCallId: 'call-1',
              runId: 'run-1',
              stepId: 'call-1',
              toolName: 'web_search',
              title: '搜索 A',
              detail: '',
              status: 'completed',
              elapsed: '1 秒',
              inputSummary: 'A',
            },
            {
              toolCallId: 'call-2',
              runId: 'run-1',
              stepId: 'call-2',
              toolName: 'web_search',
              title: '搜索 B',
              detail: '',
              status: 'running',
              elapsed: '进行中',
              inputSummary: 'B',
            },
          ],
          focusTarget: {
            kind: 'tool_call',
            runId: 'run-1',
            stepId: 'call-1',
            toolCallId: 'call-1',
          },
          sources: [],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
        onResumeAutoFollow={onResumeAutoFollow}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '回到最新' }));
    expect(onResumeAutoFollow).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('complementary', { name: '实时跟随 · 网页检索' })).toBeInTheDocument();
  });

  it('lists deliverables and opens in-workbench preview from the card', async () => {
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

    expect(screen.queryByRole('button', { name: '验证预览' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更多操作 result.md' })).toBeVisible();

    fireEvent.click(screen.getByText('result.md'));
    await waitFor(() => expect(screen.getByText('Hello')).toBeVisible());
    expect(screen.getByRole('button', { name: '返回' })).toBeVisible();
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

    fireEvent.click(screen.getByText('result.md'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'v1' })).toBeVisible());

    fireEvent.click(screen.getByRole('button', { name: 'v1' }));
    const menuTrigger = screen.getByRole('button', { name: '更多操作 result.md' });
    fireEvent.pointerDown(menuTrigger);
    fireEvent.click(menuTrigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: '基于此版本修改' }));
    expect(onReviseArtifact).toHaveBeenCalledWith(versions[0]);

    fireEvent.pointerDown(menuTrigger);
    fireEvent.click(menuTrigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: '恢复此版本' }));
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
    expect(screen.getByText('模型轮次 2')).toBeVisible();
    expect(screen.getByText('"estimatedInputTokens"')).toBeVisible();
    expect(screen.getByText('842')).toBeVisible();
    expect(screen.getByText('"content"')).toBeVisible();
    expect(screen.getByText('"你好"')).toBeVisible();
    expect(screen.getByText('"estimatedInputTokens"')).toHaveClass('json-token--key');

    fireEvent.click(screen.getByRole('tab', { name: '实时跟随' }));
    expect(onViewChange).toHaveBeenCalledWith('tool_results');
  });

  it('previews generated artifacts in 实时跟随 instead of only showing summaries', async () => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-1',
          title: '生成报告',
          subtitle: '1 次调用',
          activeView: 'tool_results',
          activityStatus: 'completed',
          executions: [
            {
              toolCallId: 'call-report',
              runId: 'run-1',
              stepId: 'call-report',
              toolName: 'create_report',
              title: '生成报告：走势复盘',
              detail: '生成报告已完成',
              status: 'completed',
              elapsed: '0.1 秒',
              inputSummary: '走势复盘',
              outputSummary: '生成报告：走势复盘',
              artifactId: 'artifact-report',
            },
          ],
          followMode: 'auto',
          sources: [],
          artifacts: [
            {
              artifactId: 'artifact-report',
              fileId: 'file-report',
              fileName: 'report.md',
              mediaType: 'text/markdown',
              fileKind: 'markdown',
              size: 12,
              status: 'ready',
              createdAt: '2026-09-21T09:00:01.000Z',
            },
          ],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    expect(screen.queryByText('结果摘要')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Hello')).toBeVisible());
    expect(screen.getByRole('region', { name: 'report.md 预览' })).toBeInTheDocument();
  });

  it.each([
    {
      fileName: '审阅意见.docx',
      fileKind: 'docx' as const,
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    {
      fileName: '摘要.pdf',
      fileKind: 'pdf' as const,
      mediaType: 'application/pdf',
    },
    {
      fileName: '数据.xlsx',
      fileKind: 'xlsx' as const,
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  ])('previews normalized $fileKind deliverables via preview API', async ({ fileName, fileKind, mediaType }) => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-office',
          title: '交付文件',
          subtitle: '1 个文件',
          activeView: 'deliverables',
          activityStatus: 'completed',
          executions: [],
          followMode: 'auto',
          sources: [],
          artifacts: [
            {
              artifactId: 'artifact-office',
              fileId: 'file-office',
              fileName,
              mediaType,
              fileKind,
              size: 4096,
              status: 'ready',
              createdAt: '2026-09-21T09:00:01.000Z',
            },
          ],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText(fileName));
    await waitFor(() => expect(screen.getByText('Hello')).toBeVisible());
    expect(screen.getByRole('note')).toHaveTextContent(
      AGENT_UI_COPY.deliverableBinaryFormatPreviewNotice,
    );
    expect(screen.queryByText(/暂不支持内联预览/u)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: `${fileName} 预览` })).toBeInTheDocument();
  });

  it('previews image artifacts inline via preview URL', async () => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-image',
          title: '截图',
          subtitle: '1 个文件',
          activeView: 'deliverables',
          activityStatus: 'completed',
          executions: [],
          followMode: 'auto',
          sources: [],
          artifacts: [
            {
              artifactId: 'artifact-image',
              fileId: 'file-image',
              fileName: 'preview.png',
              mediaType: 'image/png',
              fileKind: 'image',
              size: 872_000,
              status: 'ready',
              createdAt: '2026-09-21T09:00:01.000Z',
            },
          ],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText('preview.png'));
    const region = screen.getByRole('region', { name: 'preview.png 预览' });
    await waitFor(() =>
      expect(within(region).getByRole('img', { name: 'preview.png' })).toHaveAttribute(
        'src',
        'blob:mock-image-preview',
      ),
    );
    expect(screen.queryByText(/暂不支持内联预览/u)).not.toBeInTheDocument();
  });

  it('previews pptx deliverables via normalized preview API', async () => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-pptx',
          title: '演示文稿',
          subtitle: '1 个文件',
          activeView: 'deliverables',
          activityStatus: 'completed',
          executions: [],
          followMode: 'auto',
          sources: [],
          artifacts: [
            {
              artifactId: 'artifact-pptx',
              fileId: 'file-pptx',
              fileName: 'slides.pptx',
              mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              fileKind: 'pptx' satisfies ArtifactRef['fileKind'],
              size: 4096,
              status: 'ready',
              createdAt: '2026-09-21T09:00:01.000Z',
            },
          ],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText('slides.pptx'));
    await waitFor(() => expect(screen.getByText('Hello')).toBeVisible());
    expect(screen.queryByText(/暂不支持内联预览/u)).not.toBeInTheDocument();
  });
});
