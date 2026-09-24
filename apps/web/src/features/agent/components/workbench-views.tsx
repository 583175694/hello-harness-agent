import {
  ArrowUpRight,
  Braces,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  LoaderCircle,
  PanelRight,
  Search,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { MarkdownContent } from '../../../components/markdown-content';
import { JsonViewer } from '../../../components/ui/json-viewer';

import type {
  ReportView,
  SourceView,
  ToolCallStatus,
  ToolCallView,
  WorkbenchFocusTarget,
  WorkbenchState,
  WorkspaceView,
} from '../model/types';
import type { ArtifactRef } from '@harness/agent-protocol';
import { BashTerminalPanel } from '../elements/bash-terminal-panel';
import { downloadArtifact, getArtifactPreviewUrl } from '../../../api/client';

// 在统一 Workbench 容器中承载不同工具的视图。
export function WorkbenchShell({
  state,
  onClose,
  onViewChange,
  onExecutionSelect,
  onReviseArtifact,
  onRestoreArtifact,
}: {
  state: WorkbenchState;
  onClose: () => void;
  onViewChange: (view: WorkspaceView) => void;
  onExecutionSelect: (tool: ToolCallView) => void;
  onReviseArtifact?: (artifact: ArtifactRef) => void;
  onRestoreArtifact?: (artifact: ArtifactRef) => void;
}) {
  const views = useMemo(() => {
    const result: Array<{ id: WorkspaceView; label: string; icon: LucideIcon }> = [
      { id: 'activity', label: 'Activity', icon: LoaderCircle },
    ];
    if (state.artifacts?.length || state.artifactSeries?.length)
      result.push({ id: 'artifact', label: 'Artifact', icon: FileText });
    if (state.sources.length) result.push({ id: 'sources', label: 'Sources', icon: Search });
    // Context 是调试入口，即使当前 Run 尚未产生 Model Round 也保持可见，并固定放在最后。
    result.push({ id: 'context', label: 'Context', icon: Braces });
    if (state.report) result.push({ id: 'report', label: 'Report', icon: FileText });
    return result;
  }, [state.artifacts?.length, state.artifactSeries?.length, state.report, state.sources.length]);

  return (
    <aside
      className={`resource-workspace flex min-h-0 min-w-0 flex-col border-l border-border bg-surface text-text-primary ${state.open ? 'is-open' : ''}`}
      aria-label="工作区"
      aria-hidden={!state.open}
      inert={!state.open}
    >
      <header className="workspace-header border-b border-border-subtle bg-surface">
        <div>
          <div className="workspace-kicker">
            <PanelRight size={14} />
            Workbench
          </div>
          <h2>{state.title}</h2>
          <p>{state.subtitle}</p>
          {state.plan &&
          state.activityStatus !== 'completed' &&
          state.activityStatus !== 'failed' &&
          state.activityStatus !== 'cancelled' &&
          state.plan.plan.some((step) => step.status !== 'completed') ? (
            <span className="plan-badge">
              第 {state.plan.plan.findIndex((step) => step.status === 'in_progress') + 1 || 1} /{' '}
              {state.plan.plan.length} 步
            </span>
          ) : null}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="收起工作区"
          title="收起工作区"
          onClick={onClose}
        >
          <PanelRight size={17} />
        </button>
      </header>
      <div
        className="workspace-tabs flex border-b border-border-subtle bg-surface"
        role="tablist"
        aria-label="工作区视图"
      >
        {views.map(({ id, label, icon: TabIcon }) => (
          <button
            className={`workspace-tab inline-flex items-center gap-2 border-0 border-b-2 border-transparent px-2.5 text-text-secondary ${state.activeView === id ? 'is-active' : ''}`}
            key={id}
            type="button"
            role="tab"
            aria-selected={state.activeView === id}
            onClick={() => onViewChange(id)}
          >
            <TabIcon
              size={15}
              className={
                id === 'activity' &&
                state.activeView === id &&
                (state.activityStatus === 'running' ||
                  state.activityStatus === 'pause_requested' ||
                  state.activityStatus === 'resuming' ||
                  state.activityStatus === 'cancelling')
                  ? 'spin'
                  : ''
              }
            />
            {label}
          </button>
        ))}
      </div>
      <div className="workspace-content min-h-0 flex-1 overflow-y-auto bg-surface">
        <WorkbenchActiveView
          state={state}
          onExecutionSelect={onExecutionSelect}
          onReviseArtifact={onReviseArtifact}
          onRestoreArtifact={onRestoreArtifact}
        />
      </div>
    </aside>
  );
}

function sourceCaption(source: SourceView): string {
  if (source.kind === 'clue') return '搜索线索，尚未读取正文';
  if (source.used) return '回答采用的已读来源';
  return '已读取并保存相关原文';
}

function WorkbenchActiveView({
  state,
  onExecutionSelect,
  onReviseArtifact,
  onRestoreArtifact,
}: {
  state: WorkbenchState;
  onExecutionSelect: (tool: ToolCallView) => void;
  onReviseArtifact?: (artifact: ArtifactRef) => void;
  onRestoreArtifact?: (artifact: ArtifactRef) => void;
}) {
  if (state.activeView === 'activity') {
    return (
      <ActivityView
        executions={state.executions}
        focusTarget={state.focusTarget}
        onSelect={onExecutionSelect}
      />
    );
  }
  if (state.activeView === 'context') return <ContextView context={state.context} />;
  if (state.activeView === 'sources') return <SourcesView sources={state.sources} />;
  if (state.activeView === 'artifact') {
    return (
      <ArtifactView
        artifacts={
          state.artifactSeries?.flatMap((series) => series.versions) ?? state.artifacts ?? []
        }
        onRevise={onReviseArtifact}
        onRestore={onRestoreArtifact}
      />
    );
  }
  if (state.report) return <ReportView report={state.report} sources={state.sources} />;
  return null;
}

const artifactOperationCopy = {
  create: '创建',
  revise: '修改',
  restore: '恢复',
} as const;

function formatArtifactSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactView({
  artifacts,
  onRevise,
  onRestore,
}: {
  artifacts: ArtifactRef[];
  onRevise?: (artifact: ArtifactRef) => void;
  onRestore?: (artifact: ArtifactRef) => void;
}) {
  return (
    <div className="artifact-workbench-view">
      {artifacts.map((artifact) => (
        <article className="artifact-workbench-item" key={artifact.artifactId}>
          <div className="artifact-workbench-heading">
            <div className="artifact-workbench-file-icon" aria-hidden="true">
              <FileText size={20} />
            </div>
            <div className="artifact-workbench-title">
              <div>
                <strong>{artifact.logicalName ?? artifact.fileName}</strong>
                {artifact.versionNumber ? (
                  <span className="artifact-version">v{artifact.versionNumber}</span>
                ) : null}
                {artifact.isCurrent ? (
                  <span className="artifact-current-badge">当前版本</span>
                ) : null}
              </div>
              <p className="artifact-workbench-meta">
                <span className="artifact-workbench-operation">
                  {artifactOperationCopy[artifact.operation ?? 'create']}
                </span>
                <span>{artifact.fileKind.toUpperCase()}</span>
                <span>{formatArtifactSize(artifact.size)}</span>
                <span>{new Date(artifact.createdAt).toLocaleString('zh-CN')}</span>
                {artifact.runId ? <span>Run {artifact.runId.slice(0, 8)}</span> : null}
              </p>
            </div>
          </div>
          <div className="artifact-workbench-actions">
            <a
              className="secondary-button"
              href={getArtifactPreviewUrl(artifact.artifactId)}
              target="_blank"
              rel="noreferrer"
            >
              预览
            </a>
            <button
              className="secondary-button"
              type="button"
              onClick={() => downloadArtifact(artifact.artifactId)}
            >
              <Download size={14} />
              下载
            </button>
            {onRevise && artifact.seriesId && artifact.versionNumber ? (
              <button className="secondary-button" type="button" onClick={() => onRevise(artifact)}>
                基于此版本修改
              </button>
            ) : null}
            {onRestore && artifact.seriesId && artifact.versionNumber && !artifact.isCurrent ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  if (window.confirm(`确认将 v${artifact.versionNumber} 恢复为新的最新版本？`))
                    onRestore(artifact);
                }}
              >
                恢复此版本
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function ContextView({ context }: { context?: WorkbenchState['context'] }) {
  if (!context) {
    return (
      <div className="context-view context-view--empty">
        <strong>当前 Run 尚无 Context</strong>
        <span>下一次 Model Round 完成后，编译后的 Context JSON 会显示在这里。</span>
      </div>
    );
  }

  return (
    <div className="context-view">
      <div className="view-toolbar  m-4">
        <div>
          <strong>Model Round {context.roundSequence}</strong>
          <span>
            {context.estimatedInputTokens.toLocaleString()} estimated tokens · attempt{' '}
            {context.attempt}
          </span>
          {context.mcp ? (
            <span>
              MCP gen {context.mcp.catalogGeneration} · {context.mcp.toolCount} tools latched
            </span>
          ) : null}
        </div>
      </div>
      <JsonViewer value={context} />
    </div>
  );
}

// 展示执行时间线和当前选中的工具调用详情。
function ActivityView({
  executions,
  focusTarget,
  onSelect,
}: {
  executions: ToolCallView[];
  focusTarget?: WorkbenchFocusTarget;
  onSelect: (tool: ToolCallView) => void;
}) {
  const selectedTool =
    focusTarget?.kind === 'tool_call'
      ? executions.find((tool) => tool.toolCallId === focusTarget.toolCallId)
      : executions.at(-1);

  // 根据工具状态选择时间线图标。
  function toolIcon(toolStatus: ToolCallStatus): LucideIcon {
    if (toolStatus === 'completed') return Check;
    if (toolStatus === 'failed') return CircleAlert;
    if (toolStatus === 'waiting') return Clock3;
    if (toolStatus === 'cancelled') return X;
    return LoaderCircle;
  }

  return (
    <div className="activity-view">
      {selectedTool ? (
        selectedTool.toolName === 'bash' && selectedTool.terminal ? (
          <BashTerminalPanel
            key={selectedTool.toolCallId}
            terminal={selectedTool.terminal}
            status={selectedTool.status}
            contextLabel={selectedTool.runId.slice(0, 8)}
          />
        ) : (
          <article className="execution-detail" key={selectedTool.toolCallId} tabIndex={-1}>
            <div className="execution-detail-heading">
              <div>
                <span className="tool-name">{selectedTool.toolName}</span>
                <h3>{selectedTool.title}</h3>
              </div>
              <span className={`execution-status execution-status--${selectedTool.status}`}>
                {selectedTool.status}
              </span>
            </div>
            <p>{selectedTool.detail}</p>
            <dl>
              <div>
                <dt>业务输入</dt>
                <dd>{selectedTool.inputSummary}</dd>
              </div>
              <div>
                <dt>结果摘要</dt>
                <dd>{selectedTool.outputSummary ?? '执行中，结果尚未生成'}</dd>
              </div>
              <div className="execution-metrics">
                <span>耗时 {selectedTool.elapsed}</span>
                {selectedTool.resultCount !== undefined ? (
                  <span>{selectedTool.resultCount} 条结果</span>
                ) : null}
                {selectedTool.sourceCount !== undefined ? (
                  <span>{selectedTool.sourceCount} 个来源</span>
                ) : null}
              </div>
            </dl>
          </article>
        )
      ) : (
        <div className="execution-empty">执行详情暂不可用</div>
      )}
      <div className="execution-timeline">
        <div className="section-label">调用时间线</div>
        {executions.map((tool) => {
          const ToolIcon = toolIcon(tool.status);
          const selected = selectedTool?.toolCallId === tool.toolCallId;
          const busy = tool.status === 'running' || tool.status === 'cancelling';
          return (
            <button
              className={`execution-item ${selected ? 'is-selected' : ''}`}
              type="button"
              key={tool.toolCallId}
              aria-pressed={selected}
              onClick={() => onSelect(tool)}
            >
              <span className={`tool-call-status tool-call-status--${tool.status}`}>
                <ToolIcon className={busy ? 'spin' : ''} size={13} />
              </span>
              <span>
                <strong>{tool.title}</strong>
                <small>{tool.elapsed}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 展示已保存的来源片段和外部引用。
function SourcesView({ sources: items }: { sources: SourceView[] }) {
  const usedCount = items.filter((source) => source.kind === 'fetched' && source.used).length;
  const fetchedCount = items.filter((source) => source.kind === 'fetched').length;
  const clueCount = items.filter((source) => source.kind === 'clue').length;
  const sourceSummary = fetchedCount
    ? `${usedCount} 个回答采用 · ${fetchedCount} 个已读取 · ${clueCount} 个搜索线索`
    : `${clueCount} 个搜索线索`;
  return (
    <div className="sources-view">
      <div className="view-toolbar">
        <div>
          <strong>来源</strong>
          <span>{sourceSummary}</span>
        </div>
        <button className="icon-button" type="button" aria-label="筛选来源" title="筛选来源">
          <SlidersHorizontal size={16} />
        </button>
      </div>
      <div className="source-list">
        {items.map((source) => (
          <article className="source-item" key={source.id}>
            <div className="source-item-top">
              <span className="source-id">{source.id}</span>
              <span className="source-domain">{source.domain}</span>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`打开来源 ${source.title}`}
              >
                <ArrowUpRight size={14} />
              </a>
            </div>
            <h3>{source.title}</h3>
            <p>{source.excerpt}</p>
            {source.kind === 'fetched' ? (
              <>
                <div className="candidate-meta">
                  {source.author ? <span>{source.author}</span> : null}
                  {source.publishedAt ? <span>{source.publishedAt}</span> : null}
                  {source.contentType ? <span>{source.contentType}</span> : null}
                  {source.cacheStatus ? (
                    <span>{source.cacheStatus === 'hit' ? '缓存命中' : '实时读取'}</span>
                  ) : null}
                  {source.truncated ? <span>正文已截断</span> : null}
                </div>
                <span className="candidate-label">
                  {source.used ? '回答采用的已读来源' : '已读取网页'}
                </span>
                {source.passages?.length ? (
                  <details className="candidate-passages">
                    <summary>查看 {source.passages.length} 段原文</summary>
                    <div className="candidate-passage-list">
                      {source.passages.map((passage) => (
                        <article className="candidate-passage" key={passage.passageId}>
                          {passage.locator.sectionPath?.length ? (
                            <div className="passage-section">
                              {passage.locator.sectionPath.join(' / ')}
                            </div>
                          ) : null}
                          <MarkdownContent>{passage.text}</MarkdownContent>
                          <small>
                            位置 {passage.locator.position.start}–{passage.locator.position.end}
                          </small>
                        </article>
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}
            <small>
              {source.provider ? `${source.provider} · ` : ''}
              {source.time} ·{' '}
              {sourceCaption(source)}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
}

// 展示报告 Artifact 和确定性的来源列表。
function ReportView({ report, sources: items }: { report: ReportView; sources: SourceView[] }) {
  return (
    <div className="report-view">
      <div className="view-toolbar">
        <div>
          <strong>{report.title}</strong>
          <span>{report.updated}</span>
        </div>
        <button className="secondary-button" type="button">
          <FileText size={15} />
          文件
        </button>
      </div>
      <div className="report-document">
        {report.content}
        <div className="report-sources">
          <h3>来源列表</h3>
          {items.map((source) => (
            <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
              <span className="source-id">[{source.id}]</span>
              {source.title}
              <ArrowUpRight size={13} />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
