import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRef } from '@harness/agent-protocol';

import type * as ClientModule from '../../../api/client';

import { ConfirmProvider } from '../../../components/ui/confirm-provider';
import { toast } from '../../../components/ui/toast';
import { AGENT_UI_COPY } from '../config/ui.constants';
import { WorkbenchShell, workbenchAsideAriaLabel } from './workbench-views';

vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
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

  it('shows tool summaries in 实时跟随 and opens file preview from the 文件 tab', async () => {
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

    expect(screen.getByText('结果摘要')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'report.md 预览' })).not.toBeInTheDocument();
  });

  it('opens artifact detail when focus target points at a deliverable', async () => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-1',
          title: '交付文件',
          subtitle: '1 个文件',
          activeView: 'deliverables',
          activityStatus: 'completed',
          executions: [],
          followMode: 'pinned',
          sources: [],
          focusTarget: { kind: 'artifact', runId: 'run-1', artifactId: 'artifact-md' },
          artifacts: [
            {
              artifactId: 'artifact-md',
              fileId: 'file-md',
              fileName: '手册.md',
              mediaType: 'text/markdown',
              fileKind: 'markdown',
              size: 120,
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

    expect(screen.getByRole('tab', { name: '文件' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByText('Hello')).toBeVisible());
    expect(screen.getByRole('region', { name: '手册.md 预览' })).toBeInTheDocument();
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

  it('shows toast.error instead of window.alert when fetching full MCP output fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const toastErrorSpy = vi.spyOn(toast, 'error').mockImplementation(() => '');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    try {
      renderWorkbench(
        <WorkbenchShell
          state={{
            runId: 'run-mcp',
            title: '工具执行',
            subtitle: '1 次调用',
            activeView: 'tool_results',
            activityStatus: 'completed',
            executions: [
              {
                toolCallId: 'call-mcp-1',
                runId: 'run-mcp',
                stepId: 'call-mcp-1',
                toolName: 'mcp__demo__query',
                title: '查询数据',
                detail: '已完成',
                status: 'completed',
                elapsed: '0.5 秒',
                inputSummary: 'query',
                outputPreview: '{"ok":true}',
                outputPreviewTruncated: true,
              },
            ],
            followMode: 'auto',
            sources: [],
            open: true,
          }}
          onClose={() => undefined}
          onViewChange={() => undefined}
          onExecutionSelect={() => undefined}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '查看完整输出' }));
      await waitFor(() =>
        expect(toastErrorSpy).toHaveBeenCalledWith('无法获取完整工具输出，请稍后重试。'),
      );
      expect(alertSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      alertSpy.mockRestore();
      toastErrorSpy.mockRestore();
    }
  });

  it('renders JSON outputPreview and does not show in-flight placeholder for completed builtin tools', () => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-builtin-preview',
          title: '工具执行',
          subtitle: '1 次调用',
          activeView: 'tool_results',
          activityStatus: 'completed',
          executions: [
            {
              toolCallId: 'call-read-1',
              runId: 'run-builtin-preview',
              stepId: 'call-read-1',
              toolName: 'read_file',
              title: '读取文件',
              detail: '文件读取已完成',
              status: 'completed',
              elapsed: '0.2 秒',
              inputSummary: 'file-1 · 1-20 行',
              outputSummary: '读取 1 行文件内容',
              outputPreview: '{"lines":[{"lineNumber":1,"text":"hello"}]}',
            },
          ],
          followMode: 'auto',
          sources: [],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    expect(screen.queryByText('执行中，结果尚未生成')).not.toBeInTheDocument();
    expect(screen.getByText('文件读取已完成')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '工具返回 JSON' })).toBeInTheDocument();
    expect(screen.getByText('"hello"')).toBeInTheDocument();
  });

  it('renders web_fetch JSON responses with JsonViewer and summary banner', () => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-fetch-json',
          title: '网页检索',
          subtitle: '1 次调用 · 1 个来源',
          activeView: 'tool_results',
          activityStatus: 'completed',
          executions: [
            {
              toolCallId: 'call-fetch-1',
              runId: 'run-fetch-json',
              stepId: 'call-fetch-1',
              toolName: 'web_fetch',
              title: '读取 2 个网页',
              detail: '网页原文读取已完成',
              status: 'completed',
              elapsed: '755 毫秒',
              inputSummary: '2 个网页 · 上证指数',
              outputSummary: '成功 1 个，失败 1 个，跳过 0 个，网络请求 2 次，提取 1 段原文',
            },
          ],
          followMode: 'auto',
          sources: [
            {
              id: 'F1',
              kind: 'fetched',
              title: 'push2.eastmoney.com',
              domain: 'push2.eastmoney.com',
              url: 'https://push2.eastmoney.com/api/qt/clist/get',
              excerpt: '{"rc":0,"data":{"total":7}}',
              time: '2026-11-27 12:00:00',
              contentType: 'application/json',
              cacheStatus: 'miss',
              used: true,
              toolCallIds: ['call-fetch-1'],
              passages: [
                {
                  passageId: 'p1',
                  text: '{"rc":0,"data":{"total":7}}',
                  locator: {
                    kind: 'web_text',
                    quote: { exact: '{"rc":0,"data":{"total":7}}' },
                    position: { start: 0, end: 27 },
                  },
                },
              ],
            },
          ],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    expect(
      screen.getByText('成功 1 个，失败 1 个，跳过 0 个，网络请求 2 次，提取 1 段原文'),
    ).toBeInTheDocument();
    expect(screen.getByText('application/json')).toBeInTheDocument();
    expect(screen.getByText('回答采用')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '网页返回 JSON' })).toBeInTheDocument();
    expect(screen.getByText('"total"')).toBeInTheDocument();
  });

  it('renders web_fetch article passages with section path and metadata', () => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-fetch-article',
          title: '网页检索',
          subtitle: '1 次调用 · 1 个来源',
          activeView: 'tool_results',
          activityStatus: 'completed',
          executions: [
            {
              toolCallId: 'call-fetch-2',
              runId: 'run-fetch-article',
              stepId: 'call-fetch-2',
              toolName: 'web_fetch',
              title: '读取 1 个网页',
              detail: '网页原文读取已完成',
              status: 'completed',
              elapsed: '0.4 秒',
              inputSummary: '1 个网页',
              outputSummary: '成功 1 个，失败 0 个，跳过 0 个，网络请求 1 次，提取 1 段原文',
            },
          ],
          followMode: 'auto',
          sources: [
            {
              id: 'F1',
              kind: 'fetched',
              title: 'A股复盘文章',
              domain: 'news.example.com',
              url: 'https://news.example.com/a-share',
              excerpt: '摘要文本',
              time: '2026-11-27 12:00:00',
              contentType: 'text/html',
              cacheStatus: 'hit',
              toolCallIds: ['call-fetch-2'],
              passages: [
                {
                  passageId: 'p1',
                  text: '今日沪指缩量微涨，成交额维持高位。',
                  locator: {
                    kind: 'web_text',
                    sectionPath: ['市场综述'],
                    quote: { exact: '今日沪指缩量微涨，成交额维持高位。' },
                    position: { start: 0, end: 18 },
                  },
                },
              ],
            },
          ],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    expect(screen.getByText('缓存命中')).toBeInTheDocument();
    expect(screen.getByText('市场综述')).toBeInTheDocument();
    expect(screen.getByText('今日沪指缩量微涨，成交额维持高位。')).toBeInTheDocument();
  });

  it('does not leak unrelated sources into a failed web_fetch step and renders per-URL failure details', () => {
    renderWorkbench(
      <WorkbenchShell
        state={{
          runId: 'run-fetch-failed',
          title: '网页检索',
          subtitle: '2 次调用 · 1 个来源',
          activeView: 'tool_results',
          activityStatus: 'completed',
          executions: [
            {
              toolCallId: 'call-fetch-fail',
              runId: 'run-fetch-failed',
              stepId: 'call-fetch-fail',
              toolName: 'web_fetch',
              title: '读取 2 个网页',
              detail: '网页原文读取已完成',
              status: 'completed',
              elapsed: '117 毫秒',
              inputSummary: '2 个网页 · 行业板块 涨幅',
              outputSummary: '成功 0 个，失败 2 个，跳过 0 个，网络请求 2 次，提取 0 段原文',
              outputPreview: JSON.stringify({
                items: [
                  {
                    requestedUrl: 'https://quote.eastmoney.com/center/boardlist.html',
                    status: 'failed',
                    code: 'FETCH_JS_RENDER_REQUIRED',
                    detail: '网页需要执行 JavaScript 后才能读取正文。',
                  },
                  {
                    requestedUrl: 'https://vip.stock.example.com/blocked',
                    status: 'failed',
                    code: 'FETCH_UPSTREAM_FAILED',
                    detail: '网页来源返回不可用响应。',
                  },
                ],
              }),
            },
          ],
          followMode: 'auto',
          sources: [
            {
              id: 'F1',
              kind: 'fetched',
              title: 'push2.eastmoney.com',
              domain: 'push2.eastmoney.com',
              url: 'https://push2.eastmoney.com/api/qt/clist/get',
              excerpt: '{"rc":0}',
              time: '2026-11-27 12:00:00',
              contentType: 'application/json',
              toolCallIds: ['other-call-id'],
            },
          ],
          open: true,
        }}
        onClose={() => undefined}
        onViewChange={() => undefined}
        onExecutionSelect={() => undefined}
      />,
    );

    expect(screen.queryByText('push2.eastmoney.com')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '未读取成功的网页' })).toBeInTheDocument();
    expect(
      screen.getByText('https://quote.eastmoney.com/center/boardlist.html'),
    ).toBeInTheDocument();
    expect(screen.getByText('FETCH_JS_RENDER_REQUIRED')).toBeInTheDocument();
    expect(screen.getByText('网页需要执行 JavaScript 后才能读取正文。')).toBeInTheDocument();
  });
});
