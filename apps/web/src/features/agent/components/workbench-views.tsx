import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
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

import type {
  ActivityStatus,
  ReportView,
  SourceView,
  ToolCallStatus,
  ToolCallView,
  WorkbenchFocusTarget,
  WorkbenchState,
  WorkspaceView,
} from '../model/types';
import { ACTIVITY_STATUS_COPY } from '../config/ui.constants';

// 在统一 Workbench 容器中承载不同工具的视图。
export function WorkbenchShell({
  state,
  onClose,
  onViewChange,
  onExecutionSelect,
}: {
  state: WorkbenchState;
  onClose: () => void;
  onViewChange: (view: WorkspaceView) => void;
  onExecutionSelect: (tool: ToolCallView) => void;
}) {
  const views = useMemo(() => {
    const result: Array<{ id: WorkspaceView; label: string; icon: LucideIcon }> = [
      { id: 'activity', label: 'Activity', icon: LoaderCircle },
    ];
    if (state.sources.length) result.push({ id: 'sources', label: 'Sources', icon: Search });
    if (state.report) result.push({ id: 'report', label: 'Report', icon: FileText });
    return result;
  }, [state.report, state.sources.length]);

  return (
    <aside
      className={`resource-workspace ${state.open ? 'is-open' : ''}`}
      aria-label="工作区"
      aria-hidden={!state.open}
      inert={!state.open}
    >
      <header className="workspace-header">
        <div>
          <div className="workspace-kicker">
            <PanelRight size={14} />
            Workbench
          </div>
          <h2>{state.title}</h2>
          <p>{state.subtitle}</p>
        </div>
        <button className="icon-button" type="button" aria-label="收起工作区" title="收起工作区" onClick={onClose}>
          <PanelRight size={17} />
        </button>
      </header>
      <div className="workspace-tabs" role="tablist" aria-label="工作区视图">
        {views.map(({ id, label, icon: TabIcon }) => (
          <button
            className={`workspace-tab ${state.activeView === id ? 'is-active' : ''}`}
            key={id}
            type="button"
            role="tab"
            aria-selected={state.activeView === id}
            onClick={() => onViewChange(id)}
          >
            <TabIcon
              size={15}
              className={id === 'activity' && state.activeView === id && (state.activityStatus === 'running' || state.activityStatus === 'cancelling') ? 'spin' : ''}
            />
            {label}
          </button>
        ))}
      </div>
      <div className="workspace-content">
        {state.activeView === 'activity' ? (
          <ActivityView
            executions={state.executions}
            focusTarget={state.focusTarget}
            followMode={state.followMode}
            status={state.activityStatus ?? 'running'}
            onSelect={onExecutionSelect}
          />
        ) : state.activeView === 'sources' ? (
          <SourcesView sources={state.sources} />
        ) : state.report ? (
          <ReportView report={state.report} sources={state.sources} />
        ) : null}
      </div>
    </aside>
  );
}

// 展示执行时间线和当前选中的工具调用详情。
function ActivityView({
  executions,
  focusTarget,
  followMode,
  status,
  onSelect,
}: {
  executions: ToolCallView[];
  focusTarget?: WorkbenchFocusTarget;
  followMode: 'auto' | 'pinned';
  status: ActivityStatus;
  onSelect: (tool: ToolCallView) => void;
}) {
  const { title, subtitle } = ACTIVITY_STATUS_COPY[status];
  const isBusy = status === 'running' || status === 'cancelling';
  const selectedTool = focusTarget?.kind === 'tool_call'
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
      <div className="activity-heading">
        <div className={`activity-loader activity-loader--${status}`}>
          {status === 'failed' ? <CircleAlert size={20} /> : status === 'cancelled' ? <X size={20} /> : status === 'waiting' ? <Clock3 size={20} /> : status === 'completed' ? <Check size={20} /> : <LoaderCircle className={isBusy ? 'spin' : ''} size={20} />}
        </div>
        <div><strong>{title}</strong><span>{subtitle}</span></div>
        <span className="follow-mode">{followMode === 'auto' ? '自动跟随' : '已固定'}</span>
      </div>
      <div className="execution-timeline">
        <div className="section-label">调用时间线</div>
        {executions.map((tool) => {
          const ToolIcon = toolIcon(tool.status);
          const selected = selectedTool?.toolCallId === tool.toolCallId;
          const busy = tool.status === 'running' || tool.status === 'cancelling';
          return (
            <button className={`execution-item ${selected ? 'is-selected' : ''}`} type="button" key={tool.toolCallId} aria-pressed={selected} onClick={() => onSelect(tool)}>
              <span className={`tool-call-status tool-call-status--${tool.status}`}><ToolIcon className={busy ? 'spin' : ''} size={13} /></span>
              <span><strong>{tool.title}</strong><small>{tool.elapsed}</small></span>
              <ChevronRight size={14} />
            </button>
          );
        })}
      </div>
      {selectedTool ? (
        <article className="execution-detail" key={selectedTool.toolCallId} tabIndex={-1}>
          <div className="execution-detail-heading">
            <div><span className="tool-name">{selectedTool.toolName}</span><h3>{selectedTool.title}</h3></div>
            <span className={`execution-status execution-status--${selectedTool.status}`}>{selectedTool.status}</span>
          </div>
          <p>{selectedTool.detail}</p>
          <dl>
            <div><dt>业务输入</dt><dd>{selectedTool.inputSummary}</dd></div>
            <div><dt>结果摘要</dt><dd>{selectedTool.outputSummary ?? '执行中，结果尚未生成'}</dd></div>
            <div className="execution-metrics">
              <span>耗时 {selectedTool.elapsed}</span>
              {selectedTool.resultCount !== undefined ? <span>{selectedTool.resultCount} 条结果</span> : null}
              {selectedTool.sourceCount !== undefined ? <span>{selectedTool.sourceCount} 个来源</span> : null}
            </div>
          </dl>
        </article>
      ) : <div className="execution-empty">执行详情暂不可用</div>}
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
        <div><strong>来源</strong><span>{sourceSummary}</span></div>
        <button className="icon-button" type="button" aria-label="筛选来源" title="筛选来源"><SlidersHorizontal size={16} /></button>
      </div>
      <div className="source-list">
        {items.map((source) => (
          <article className="source-item" key={source.id}>
            <div className="source-item-top">
              <span className="source-id">{source.id}</span>
              <span className="source-domain">{source.domain}</span>
              <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`打开来源 ${source.title}`}><ArrowUpRight size={14} /></a>
            </div>
            <h3>{source.title}</h3><p>{source.excerpt}</p>
            {source.kind === 'fetched' ? (
              <>
                <div className="candidate-meta">
                  {source.author ? <span>{source.author}</span> : null}
                  {source.publishedAt ? <span>{source.publishedAt}</span> : null}
                  {source.contentType ? <span>{source.contentType}</span> : null}
                  {source.cacheStatus ? <span>{source.cacheStatus === 'hit' ? '缓存命中' : '实时读取'}</span> : null}
                  {source.truncated ? <span>正文已截断</span> : null}
                </div>
                <span className="candidate-label">{source.used ? '回答采用的已读来源' : '已读取网页'}</span>
                {source.passages?.length ? (
                  <details className="candidate-passages">
                    <summary>查看 {source.passages.length} 段原文</summary>
                    <div className="candidate-passage-list">
                      {source.passages.map((passage) => (
                        <article className="candidate-passage" key={passage.passageId}>
                          {passage.locator.sectionPath?.length
                            ? <div className="passage-section">{passage.locator.sectionPath.join(' / ')}</div>
                            : null}
                          <MarkdownContent>{passage.text}</MarkdownContent>
                          <small>位置 {passage.locator.position.start}–{passage.locator.position.end}</small>
                        </article>
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}
            <small>{source.provider ? `${source.provider} · ` : ''}{source.time} · {source.kind === 'clue' ? '搜索线索，尚未读取正文' : source.used ? '回答采用的已读来源' : '已读取并保存相关原文'}</small>
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
        <div><strong>{report.title}</strong><span>{report.updated}</span></div>
        <button className="secondary-button" type="button"><FileText size={15} />文件</button>
      </div>
      <div className="report-document">
        {report.content}
        <div className="report-sources"><h3>来源列表</h3>
          {items.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><span className="source-id">[{source.id}]</span>{source.title}<ArrowUpRight size={13} /></a>)}
        </div>
      </div>
    </div>
  );
}
