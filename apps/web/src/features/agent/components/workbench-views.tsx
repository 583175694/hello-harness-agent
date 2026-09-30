import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  Eye,
  FileText,
  Link2,
  PanelRight,
  Pencil,
  Search,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MarkdownContent } from '../../../components/markdown-content';
import {
  DeliverableMarkdownPanel,
  isNormalizedDocumentPreview,
  NORMALIZED_DOCUMENT_FILE_KINDS,
} from './deliverable-document-preview';
import { useConfirm } from '../../../components/ui/confirm-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { JsonViewer } from '../../../components/ui/json-viewer';
import { Slider } from '../../../components/ui/slider';

import type {
  ReportView,
  SourceView,
  ToolCallView,
  WorkbenchFocusTarget,
  WorkbenchState,
  WorkspaceView,
} from '../model/types';
import type { ArtifactRef } from '@harness/agent-protocol';
import { BashTerminalPanel } from '../elements/bash-terminal-panel';
import { downloadArtifact, getArtifactPreview, getArtifactPreviewUrl } from '../../../api/client';
import { parseJsonPreviewText } from '../../../lib/parse-json-preview';
import { AGENT_UI_COPY } from '../config/ui.constants';
import { isMcpPublicToolName } from '../model/tool-copy';

const WORKBENCH_TABS: Array<{ id: WorkspaceView; label: string }> = [
  { id: 'tool_results', label: AGENT_UI_COPY.workbenchTabLabels.toolResults },
  { id: 'deliverables', label: AGENT_UI_COPY.workbenchTabLabels.deliverables },
  { id: 'context', label: AGENT_UI_COPY.workbenchTabLabels.context },
];

const WORKBENCH_TAB_PANEL_ID: Record<WorkspaceView, string> = {
  tool_results: 'workbench-panel-tool-results',
  deliverables: 'workbench-panel-deliverables',
  context: 'workbench-panel-context',
};

const WORKBENCH_VIEW_ARIA_LABEL: Record<WorkspaceView, string> = {
  tool_results: AGENT_UI_COPY.workbenchTabLabels.toolResults,
  deliverables: AGENT_UI_COPY.workbenchTabLabels.deliverables,
  context: AGENT_UI_COPY.workbenchTabLabels.context,
};

export function workbenchAsideAriaLabel(state: Pick<WorkbenchState, 'activeView' | 'title'>): string {
  const viewLabel = WORKBENCH_VIEW_ARIA_LABEL[state.activeView];
  return state.title ? `${viewLabel} · ${state.title}` : viewLabel;
}

export function workbenchTablistAriaLabel(
  tabs: Array<{ id: WorkspaceView; label: string }>,
): string {
  return tabs.map((tab) => tab.label).join('、');
}

function buildSourceSummary(items: SourceView[]): string {
  const usedCount = items.filter((source) => source.kind === 'fetched' && source.used).length;
  const fetchedCount = items.filter((source) => source.kind === 'fetched').length;
  const clueCount = items.filter((source) => source.kind === 'clue').length;
  return fetchedCount
    ? `${usedCount} 个回答采用 · ${fetchedCount} 个已读取 · ${clueCount} 个搜索线索`
    : `${clueCount} 个搜索线索`;
}

export function resolveToolCallIndex(
  executions: ToolCallView[],
  focusTarget?: WorkbenchFocusTarget,
  artifacts?: ArtifactRef[],
): number {
  if (!executions.length) return 0;
  if (focusTarget?.kind === 'tool_call') {
    const index = executions.findIndex((tool) => tool.toolCallId === focusTarget.toolCallId);
    if (index >= 0) return index;
  }
  if (focusTarget?.kind === 'artifact') {
    const byArtifactId = executions.findIndex(
      (tool) => tool.artifactId === focusTarget.artifactId,
    );
    if (byArtifactId >= 0) return byArtifactId;
    const artifact = artifacts?.find((item) => item.artifactId === focusTarget.artifactId);
    if (artifact) {
      const byFileName = executions.findIndex(
        (tool) =>
          ARTIFACT_TOOL_NAMES.has(tool.toolName) &&
          (tool.title.includes(artifact.fileName) ||
            tool.inputSummary.includes(artifact.fileName)),
      );
      if (byFileName >= 0) return byFileName;
    }
  }
  return executions.length - 1;
}

const ARTIFACT_TOOL_NAMES = new Set(['create_file', 'create_report']);

export function resolveArtifactForTool(
  tool: ToolCallView,
  artifacts?: ArtifactRef[],
): ArtifactRef | undefined {
  if (!artifacts?.length) return undefined;
  if (tool.artifactId) {
    return artifacts.find((item) => item.artifactId === tool.artifactId);
  }
  if (!ARTIFACT_TOOL_NAMES.has(tool.toolName)) return undefined;
  return undefined;
}

type WorkbenchShellProps = {
  state: WorkbenchState;
  onClose: () => void;
  onViewChange: (view: WorkspaceView) => void;
  onExecutionSelect: (tool: ToolCallView) => void;
  onResumeAutoFollow?: () => void;
  onReviseArtifact?: (artifact: ArtifactRef) => void;
  onRestoreArtifact?: (artifact: ArtifactRef) => void;
};

/** 输入框等 App 层 state 变化时不应带动整块 Workbench 重绘（尤其 Context JSON / 预览 Markdown）。 */
function workbenchShellPropsAreEqual(prev: WorkbenchShellProps, next: WorkbenchShellProps): boolean {
  if (prev.state === next.state) return true;
  const a = prev.state;
  const b = next.state;
  return (
    a.open === b.open &&
    a.activeView === b.activeView &&
    a.runId === b.runId &&
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.activityStatus === b.activityStatus &&
    a.executions === b.executions &&
    a.sources === b.sources &&
    a.context === b.context &&
    a.artifacts === b.artifacts &&
    a.artifactSeries === b.artifactSeries &&
    a.focusTarget === b.focusTarget &&
    a.report === b.report &&
    a.followMode === b.followMode &&
    a.plan === b.plan &&
    a.activeInterrupt === b.activeInterrupt
  );
}

export const WorkbenchShell = memo(function WorkbenchShell({
  state,
  onClose,
  onViewChange,
  onExecutionSelect,
  onResumeAutoFollow,
  onReviseArtifact,
  onRestoreArtifact,
}: WorkbenchShellProps) {
  const toolIndex = resolveToolCallIndex(
    state.executions,
    state.focusTarget,
    state.artifacts,
  );
  const showToolSlider =
    state.activeView === 'tool_results' && state.executions.length > 1;
  const runStillActive =
    state.activityStatus === 'running' ||
    state.activityStatus === 'queued' ||
    state.activityStatus === 'cancelling' ||
    state.activityStatus === 'resuming' ||
    state.activityStatus === 'pause_requested';
  const behindLatest =
    state.executions.length > 0 && toolIndex < state.executions.length - 1;
  const showResumeAutoFollow =
    state.activeView === 'tool_results' &&
    state.followMode === 'pinned' &&
    onResumeAutoFollow &&
    (behindLatest || runStillActive);
  const tabListId = useId();
  const visibleTabs = useMemo(
    () =>
      WORKBENCH_TABS.filter(
        (tab) => tab.id !== 'deliverables' || workbenchHasDeliverablesTab(state),
      ),
    [state.artifacts, state.artifactSeries, state.report],
  );

  useEffect(() => {
    if (state.activeView === 'deliverables' && !workbenchHasDeliverablesTab(state)) {
      onViewChange('tool_results');
    }
  }, [state.activeView, state.artifacts, state.artifactSeries, state.report, onViewChange]);

  return (
    <aside
      className={`resource-workspace flex h-full min-h-0 min-w-0 flex-col text-text-primary ${state.open ? 'is-open' : ''}`}
      aria-label={workbenchAsideAriaLabel(state)}
      aria-hidden={!state.open}
      inert={!state.open}
    >
      {state.open ? (
        <>
          <header className="workbench-chrome workbench-chrome--minimal">
            <WorkbenchTabList
              tabListId={tabListId}
              tabs={visibleTabs}
              activeView={state.activeView}
              tablistAriaLabel={workbenchTablistAriaLabel(visibleTabs)}
              onViewChange={onViewChange}
            />
            <button
              className="workbench-open-button workbench-chrome__close"
              type="button"
              aria-label="收起工作区"
              title="收起工作区"
              onClick={onClose}
            >
              <PanelRight size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="workbench-open-button__label">{AGENT_UI_COPY.openWorkbenchLabel}</span>
            </button>
          </header>
          <div className="workspace-content workbench-stage flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              key={state.activeView}
              className="workbench-tabpanel workbench-tabpanel--animated min-h-0 flex-1 overflow-y-auto"
              role="tabpanel"
              id={WORKBENCH_TAB_PANEL_ID[state.activeView]}
              aria-labelledby={`workbench-tab-${state.activeView}`}
            >
              <WorkbenchActiveView
                state={state}
                toolIndex={toolIndex}
                onExecutionSelect={onExecutionSelect}
                onReviseArtifact={onReviseArtifact}
                onRestoreArtifact={onRestoreArtifact}
              />
            </div>
            {showResumeAutoFollow ? (
              <div className="workbench-follow-resume-float">
                <button
                  type="button"
                  className="workbench-follow-resume-fab"
                  onClick={onResumeAutoFollow}
                >
                  回到最新
                </button>
              </div>
            ) : null}
            {showToolSlider ? (
              <ToolCallSliderFooter
                executions={state.executions}
                index={toolIndex}
                onIndexChange={(nextIndex) => {
                  const tool = state.executions[nextIndex];
                  if (tool) onExecutionSelect(tool);
                }}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </aside>
  );
}, workbenchShellPropsAreEqual);

function WorkbenchTabList({
  tabListId,
  tabs,
  activeView,
  tablistAriaLabel,
  onViewChange,
}: {
  tabListId: string;
  tabs: Array<{ id: WorkspaceView; label: string }>;
  activeView: WorkspaceView;
  tablistAriaLabel: string;
  onViewChange: (view: WorkspaceView) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const syncIndicator = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const activeTab = list.querySelector<HTMLElement>(`#workbench-tab-${activeView}`);
    if (!activeTab) return;
    setIndicator({ left: activeTab.offsetLeft, width: activeTab.offsetWidth });
  }, [activeView]);

  useLayoutEffect(() => {
    syncIndicator();
  }, [syncIndicator, tabs.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        syncIndicator();
      });
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [syncIndicator]);

  return (
    <div
      ref={listRef}
      className="workspace-tabs workspace-tabs--workbench workbench-chrome__tabs"
      role="tablist"
      id={tabListId}
      aria-label={tablistAriaLabel}
    >
      {tabs.map(({ id, label }) => {
        const tabId = `workbench-tab-${id}`;
        return (
          <button
            className={`workspace-tab ${activeView === id ? 'is-active' : ''}`}
            key={id}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={activeView === id}
            aria-controls={WORKBENCH_TAB_PANEL_ID[id]}
            tabIndex={activeView === id ? 0 : -1}
            onClick={() => onViewChange(id)}
          >
            {label}
          </button>
        );
      })}
      <span
        className="workspace-tabs__indicator"
        aria-hidden="true"
        style={{
          width: indicator.width,
          transform: `translateX(${indicator.left}px)`,
        }}
      />
    </div>
  );
}

function ToolCallSliderFooter({
  executions,
  index,
  onIndexChange,
}: {
  executions: ToolCallView[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const max = Math.max(0, executions.length - 1);
  const canPrev = index > 0;
  const canNext = index < max;
  return (
    <footer className="workbench-tool-slider">
      <div className="workbench-tool-slider__label">
        步骤 {index + 1} / {executions.length}
      </div>
      <div className="workbench-tool-slider__row">
        <button
          className="icon-button workbench-tool-slider__step"
          type="button"
          aria-label="上一步"
          disabled={!canPrev}
          onClick={() => onIndexChange(index - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <Slider
          className="workbench-tool-slider__control"
          min={0}
          max={max}
          step={1}
          value={[index]}
          onValueChange={(value) => {
            const next = value[0];
            if (next !== undefined) onIndexChange(next);
          }}
        />
        <button
          className="icon-button workbench-tool-slider__step"
          type="button"
          aria-label="下一步"
          disabled={!canNext}
          onClick={() => onIndexChange(index + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </footer>
  );
}

function WorkbenchActiveView({
  state,
  toolIndex,
  onExecutionSelect,
  onReviseArtifact,
  onRestoreArtifact,
}: {
  state: WorkbenchState;
  toolIndex: number;
  onExecutionSelect: (tool: ToolCallView) => void;
  onReviseArtifact?: (artifact: ArtifactRef) => void;
  onRestoreArtifact?: (artifact: ArtifactRef) => void;
}) {
  if (state.activeView === 'context') return <ContextView context={state.context} />;
  if (state.activeView === 'deliverables') {
    return (
      <DeliverablesView
        state={state}
        onRevise={onReviseArtifact}
        onRestore={onRestoreArtifact}
      />
    );
  }
  return (
    <ToolResultsView
      executions={state.executions}
      sources={state.sources}
      artifacts={state.artifacts}
      focusTarget={state.focusTarget}
      toolIndex={toolIndex}
      onSelectByIndex={(nextIndex) => {
        const tool = state.executions[nextIndex];
        if (tool) onExecutionSelect(tool);
      }}
    />
  );
}

function ToolResultsView({
  executions,
  sources,
  artifacts,
  focusTarget,
  toolIndex,
  onSelectByIndex,
}: {
  executions: ToolCallView[];
  sources: SourceView[];
  artifacts?: ArtifactRef[];
  focusTarget?: WorkbenchFocusTarget;
  toolIndex: number;
  onSelectByIndex: (index: number) => void;
}) {
  const focusArtifactId =
    focusTarget?.kind === 'artifact' ? focusTarget.artifactId : undefined;
  const selectedTool = executions[toolIndex];
  const relatedSources = useMemo(() => {
    if (!selectedTool) return sources;
    const scoped = sources.filter((source) =>
      source.toolCallIds?.includes(selectedTool.toolCallId),
    );
    return scoped.length ? scoped : sources;
  }, [selectedTool, sources]);

  if (!executions.length) {
    if (sources.length) return <SourcesView sources={sources} />;
    return (
      <div className="execution-empty workbench-empty-state m-4">
        <span className="workbench-empty-state__title">暂无过程记录</span>
        <span className="workbench-empty-state__hint">
          助手的检索、读取与命令执行会显示在这里。
        </span>
      </div>
    );
  }

  return (
    <div className="tool-results-view tool-results-view--fill">
      <DeliverablesPageHeader
        title={
          <>
            <span className="deliverables-page-header__filename">
              {selectedTool?.title ?? selectedTool?.toolName ?? '执行步骤'}
            </span>
            {selectedTool?.elapsed ? (
              <span className="deliverables-page-header__version">{selectedTool.elapsed}</span>
            ) : null}
          </>
        }
      />
      {selectedTool ? (
        <ToolResultBody
          tool={selectedTool}
          sources={relatedSources}
          artifacts={artifacts}
          focusArtifactId={focusArtifactId}
        />
      ) : (
        <div className="execution-empty workbench-empty-state">
          <span className="workbench-empty-state__title">执行详情暂不可用</span>
          <span className="workbench-empty-state__hint">请切换上一步或下一步，或等待当前工具完成。</span>
        </div>
      )}
    </div>
  );
}

function ToolResultBody({
  tool,
  sources,
  artifacts,
  focusArtifactId,
}: {
  tool: ToolCallView;
  sources: SourceView[];
  artifacts?: ArtifactRef[];
  focusArtifactId?: string;
}) {
  if (tool.toolName === 'bash' && tool.terminal) {
    return (
      <BashTerminalPanel
        key={tool.toolCallId}
        terminal={tool.terminal}
        status={tool.status}
        contextLabel={tool.runId.slice(0, 8)}
      />
    );
  }
  if (
    (tool.toolName === 'web_search' || tool.toolName === 'web_fetch') &&
    sources.length
  ) {
    return <SourcesView sources={sources} compact />;
  }
  const artifact =
    resolveArtifactForTool(tool, artifacts) ??
    (focusArtifactId && tool.artifactId === focusArtifactId
      ? artifacts?.find((item) => item.artifactId === focusArtifactId)
      : focusArtifactId && ARTIFACT_TOOL_NAMES.has(tool.toolName)
        ? artifacts?.find((item) => item.artifactId === focusArtifactId)
        : undefined);
  if (artifact && tool.status === 'completed') {
    return (
      <div className="tool-result-artifact" key={tool.toolCallId}>
        <ArtifactPreviewBody artifact={artifact} />
      </div>
    );
  }
  if (isMcpPublicToolName(tool.toolName)) {
    return <McpToolResultView key={tool.toolCallId} tool={tool} />;
  }
  return (
    <article className="execution-detail" key={tool.toolCallId} tabIndex={-1}>
      <div className="execution-detail-heading">
        <div className="execution-detail-heading__copy">
          <span className="tool-name">{tool.toolName}</span>
          <div className="execution-detail-heading__title">{tool.title}</div>
        </div>
        <span className={`execution-status execution-status--${tool.status}`}>
          {TOOL_STATUS_COPY[tool.status] ?? tool.status}
        </span>
      </div>
      <p>{tool.detail}</p>
      <dl>
        <div>
          <dt>业务输入</dt>
          <dd>{tool.inputSummary}</dd>
        </div>
        <div>
          <dt>结果摘要</dt>
          <dd>{tool.outputSummary ?? '执行中，结果尚未生成'}</dd>
        </div>
        <div className="execution-metrics">
          <span>耗时 {tool.elapsed}</span>
          {tool.resultCount !== undefined ? <span>{tool.resultCount} 条结果</span> : null}
          {tool.sourceCount !== undefined ? <span>{tool.sourceCount} 个来源</span> : null}
        </div>
      </dl>
    </article>
  );
}

function McpToolResultView({ tool }: { tool: ToolCallView }) {
  const callDescription = tool.outputSummary ?? tool.inputSummary;
  const parsedOutput = useMemo(
    () =>
      tool.outputPreview !== undefined && tool.outputPreview.length > 0
        ? parseJsonPreviewText(tool.outputPreview)
        : null,
    [tool.outputPreview],
  );

  return (
    <article
      className="execution-detail execution-detail--mcp execution-detail--mcp-panel"
      key={tool.toolCallId}
      tabIndex={-1}
    >
      <div className="execution-detail-heading mcp-tool-result-header">
        <div className="execution-detail-heading__copy">
          <div className="execution-detail-heading__title">{tool.title}</div>
        </div>
        <span className={`execution-status execution-status--${tool.status}`}>
          {TOOL_STATUS_COPY[tool.status] ?? tool.status}
        </span>
      </div>
      <div className="mcp-tool-result-call">
        <span className="mcp-tool-result-call__label">调用说明</span>
        <p className="mcp-tool-result-call__text" title={callDescription || undefined}>
          {callDescription || '—'}
        </p>
      </div>
      {parsedOutput ? (
        <div className="mcp-tool-result-json">
          <JsonViewer
            value={parsedOutput}
            label="工具返回"
            copyAriaLabel="复制工具返回 JSON"
            regionAriaLabel="MCP 工具返回 JSON"
          />
        </div>
      ) : tool.status === 'completed' ? (
        <p className="execution-detail__empty mcp-tool-result-empty">暂无可展示的 JSON 预览。</p>
      ) : null}
      <footer className="mcp-tool-result-footer execution-metrics">
        <span>耗时 {tool.elapsed}</span>
      </footer>
    </article>
  );
}

function sourceCaption(source: SourceView): string {
  if (source.kind === 'clue') return '搜索线索，尚未读取正文';
  if (source.used) return '回答采用的已读来源';
  return '已读取并保存相关原文';
}

const TOOL_STATUS_COPY: Record<ToolCallView['status'], string> = {
  pending: '等待中',
  running: '执行中',
  waiting: '等待确认',
  cancelling: '取消中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function SourcesView({ sources: items, compact }: { sources: SourceView[]; compact?: boolean }) {
  if (compact) {
    return (
      <div className="sources-view sources-view--compact">
        <ul className="source-result-list" role="list">
          {items.map((source) => (
            <li className="source-result-row" key={source.id}>
              <a
                className="source-result-row__title"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Link2 className="source-result-row__icon" size={15} aria-hidden />
                <span>{source.title}</span>
              </a>
              {source.excerpt ? (
                <p className="source-result-row__snippet">{source.excerpt}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const sourceSummary = buildSourceSummary(items);
  return (
    <div className="sources-view">
      <div className="sources-view__summary">
        <div className="sources-view__summary-text">
          <span className="sources-view__summary-label">来源</span>
          <span>{sourceSummary}</span>
        </div>
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
              {source.time} · {sourceCaption(source)}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
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

function collectDeliverableArtifacts(state: WorkbenchState): ArtifactRef[] {
  if (state.artifactSeries?.length) {
    return state.artifactSeries.flatMap((series) => series.versions);
  }
  return state.artifacts ?? [];
}

export function workbenchHasDeliverablesTab(state: WorkbenchState): boolean {
  return collectDeliverableArtifacts(state).length > 0 || Boolean(state.report);
}

function DeliverablesPageHeader({
  leading,
  title,
  trailing,
  footer,
}: {
  leading?: ReactNode;
  title?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
}) {
  if (!leading && !title && !trailing && !footer) return null;

  return (
    <header className="deliverables-page-header">
      <div
        className={`deliverables-page-header__row ${!title && !leading ? 'deliverables-page-header__row--trailing-only' : ''}`}
      >
        <div className="deliverables-page-header__leading">
          {leading}
          {title ? (
            <div className="deliverables-page-header__title-block">
              <div className="deliverables-page-header__title">{title}</div>
            </div>
          ) : null}
        </div>
        {trailing ? <div className="deliverables-page-header__trailing">{trailing}</div> : null}
      </div>
      {footer ? <div className="deliverables-page-header__footer">{footer}</div> : null}
    </header>
  );
}

function deliverablesForList(state: WorkbenchState): ArtifactRef[] {
  if (state.artifactSeries?.length) {
    return state.artifactSeries
      .map((series) => {
        const current = series.versions.find((item) => item.artifactId === series.currentArtifactId);
        return current ?? series.versions.at(-1);
      })
      .filter((item): item is ArtifactRef => Boolean(item));
  }
  return state.artifacts ?? [];
}

function DeliverablesView({
  state,
  onRevise,
  onRestore,
}: {
  state: WorkbenchState;
  onRevise?: (artifact: ArtifactRef) => void;
  onRestore?: (artifact: ArtifactRef) => void;
}) {
  const allArtifacts = collectDeliverableArtifacts(state);
  const listArtifacts = deliverablesForList(state);
  // 文件 Tab 默认展示列表；预览仅由用户在列表中点击触发（不跟随全局 artifact focusTarget）。
  const [detailArtifactId, setDetailArtifactId] = useState<string | null>(null);

  const detailArtifact =
    detailArtifactId !== null
      ? allArtifacts.find((item) => item.artifactId === detailArtifactId) ??
        listArtifacts.find((item) => item.artifactId === detailArtifactId)
      : undefined;

  const seriesVersions =
    detailArtifact?.seriesId != null
      ? allArtifacts.filter((item) => item.seriesId === detailArtifact.seriesId)
      : [];

  if (state.report && !allArtifacts.length) {
    return <ReportView report={state.report} sources={state.sources} />;
  }

  if (!allArtifacts.length) {
    return (
      <div className="deliverables-empty deliverables-empty--centered m-4">
        <strong>暂无文件</strong>
        <span>助手生成的报告、网页或可下载文件会出现在这里。</span>
      </div>
    );
  }

  if (!detailArtifact) {
    return (
      <div className="deliverables-view deliverables-view--list">
        <div className="deliverables-list">
          {listArtifacts.map((artifact) => (
            <ArtifactListCard
              key={artifact.artifactId}
              artifact={artifact}
              onPreview={() => setDetailArtifactId(artifact.artifactId)}
              onRevise={onRevise}
            />
          ))}
        </div>
        {state.report ? (
          <div className="deliverables-report-addon">
            <ReportView report={state.report} sources={state.sources} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="deliverables-view deliverables-view--detail">
      <DeliverablesPageHeader
        leading={
          <button
            type="button"
            className="deliverables-back-button"
            onClick={() => setDetailArtifactId(null)}
          >
            <ChevronLeft size={16} aria-hidden />
            返回
          </button>
        }
        title={
          <>
            <span className="deliverables-page-header__filename">
              {detailArtifact.logicalName ?? detailArtifact.fileName}
            </span>
            {detailArtifact.versionNumber ? (
              <span className="deliverables-page-header__version">
                v{detailArtifact.versionNumber}
              </span>
            ) : null}
          </>
        }
        trailing={
          <>
            {detailArtifact.fileKind === 'html' || detailArtifact.mediaType === 'text/html' ? (
              <ArtifactHtmlDetailActions artifact={detailArtifact} />
            ) : null}
            <ArtifactActionsMenu
              artifact={detailArtifact}
              onPreview={() => setDetailArtifactId(detailArtifact.artifactId)}
              onRevise={onRevise}
              onRestore={onRestore}
              triggerClassName="artifact-workbench-item__menu-trigger"
            />
          </>
        }
        footer={
          seriesVersions.length > 1 ? (
            <div className="deliverables-version-chips" role="group" aria-label="版本">
              {seriesVersions.map((artifact) => (
                <button
                  key={artifact.artifactId}
                  type="button"
                  aria-pressed={artifact.artifactId === detailArtifact.artifactId}
                  className={`deliverables-version-chip ${artifact.artifactId === detailArtifact.artifactId ? 'is-active' : ''}`}
                  onClick={() => setDetailArtifactId(artifact.artifactId)}
                >
                  v{artifact.versionNumber ?? 1}
                  {artifact.isCurrent ? ' · 当前' : ''}
                </button>
              ))}
            </div>
          ) : null
        }
      />
      <ArtifactPreviewBody artifact={detailArtifact} />
      {state.report ? (
        <div className="deliverables-report-addon">
          <ReportView report={state.report} sources={state.sources} />
        </div>
      ) : null}
    </div>
  );
}

function ArtifactActionsMenu({
  artifact,
  onPreview,
  onRevise,
  onRestore,
  triggerClassName = '',
}: {
  artifact: ArtifactRef;
  onPreview: () => void;
  onRevise?: (artifact: ArtifactRef) => void;
  onRestore?: (artifact: ArtifactRef) => void;
  triggerClassName?: string;
}) {
  const confirm = useConfirm();
  const canRevise = Boolean(onRevise && artifact.seriesId && artifact.versionNumber);
  const canRestore = Boolean(
    onRestore && artifact.seriesId && artifact.versionNumber && !artifact.isCurrent,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`icon-button artifact-card-menu-trigger ${triggerClassName}`.trim()}
          aria-label={`更多操作 ${artifact.logicalName ?? artifact.fileName}`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Ellipsis size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="artifact-card-menu">
        <DropdownMenuItem
          onSelect={() => {
            downloadArtifact(artifact.artifactId);
          }}
        >
          <Download size={15} />
          下载
        </DropdownMenuItem>
        {canRevise ? (
          <DropdownMenuItem
            onSelect={() => {
              onRevise?.(artifact);
            }}
          >
            <Pencil size={15} />
            基于此版本修改
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            onPreview();
          }}
        >
          <Eye size={15} />
          预览
        </DropdownMenuItem>
        {canRestore ? (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              void (async () => {
                if (
                  !(await confirm({
                    title: '恢复此版本',
                    description: `确认将 v${artifact.versionNumber} 恢复为新的最新版本？`,
                    confirmLabel: '恢复',
                  }))
                ) {
                  return;
                }
                onRestore?.(artifact);
              })();
            }}
          >
            恢复此版本
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ArtifactListCard({
  artifact,
  onPreview,
  onRevise,
}: {
  artifact: ArtifactRef;
  onPreview: () => void;
  onRevise?: (artifact: ArtifactRef) => void;
}) {
  return (
    <article
      className="artifact-workbench-item artifact-workbench-item--list"
      role="button"
      tabIndex={0}
      onClick={() => onPreview()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPreview();
        }
      }}
    >
      <div className="artifact-workbench-heading">
        <div className="artifact-workbench-file-icon" aria-hidden="true">
          <FileText size={18} />
        </div>
        <div className="artifact-workbench-title">
          <div className="artifact-workbench-title-row">
            <span className="artifact-workbench-filename">
              {artifact.logicalName ?? artifact.fileName}
            </span>
            {artifact.versionNumber ? (
              <span className="artifact-version">v{artifact.versionNumber}</span>
            ) : null}
            {artifact.isCurrent ? <span className="artifact-current-badge">当前版本</span> : null}
          </div>
          <p className="artifact-workbench-meta artifact-workbench-meta--compact">
            <span className="artifact-workbench-operation">
              {artifactOperationCopy[artifact.operation ?? 'create']}
            </span>
            <span>{artifact.fileKind.toUpperCase()}</span>
            <span>{formatArtifactSize(artifact.size)}</span>
            <span>{new Date(artifact.createdAt).toLocaleString('zh-CN')}</span>
          </p>
        </div>
        <ArtifactActionsMenu artifact={artifact} onPreview={onPreview} onRevise={onRevise} />
      </div>
    </article>
  );
}

/** 工具事件会换掉 Artifact 对象引用，但同一份预览的展示字段不变。 */
function sameArtifactPreview(prev: ArtifactRef, next: ArtifactRef): boolean {
  return (
    prev.artifactId === next.artifactId &&
    prev.fileKind === next.fileKind &&
    prev.mediaType === next.mediaType &&
    prev.fileName === next.fileName &&
    prev.logicalName === next.logicalName
  );
}

const ArtifactPreviewBody = memo(function ArtifactPreviewBody({ artifact }: { artifact: ArtifactRef }) {
  const previewUrl = getArtifactPreviewUrl(artifact.artifactId);
  const isHtml = artifact.fileKind === 'html' || artifact.mediaType === 'text/html';
  const isInlineText =
    artifact.fileKind === 'markdown' ||
    artifact.fileKind === 'text' ||
    artifact.fileKind === 'json' ||
    (artifact.mediaType?.startsWith('text/') ?? false);
  const isNormalizedDocument = isNormalizedDocumentPreview(artifact.fileKind, artifact.fileName);

  return (
    <section
      className="artifact-workbench-preview artifact-workbench-preview--detail"
      aria-label={`${artifact.logicalName ?? artifact.fileName} 预览`}
    >
      {isHtml ? (
        <ArtifactHtmlPreview artifact={artifact} previewUrl={previewUrl} />
      ) : isInlineText || isNormalizedDocument ? (
        <ArtifactTextPreview
          artifactId={artifact.artifactId}
          fileKind={artifact.fileKind}
          fileName={artifact.fileName}
        />
      ) : (
        <ArtifactFallbackPreview artifact={artifact} previewUrl={previewUrl} />
      )}
    </section>
  );
}, (prev, next) => sameArtifactPreview(prev.artifact, next.artifact));

function DeliverablePreviewSkeleton({ overlay }: { overlay?: boolean }) {
  return (
    <div
      className={`deliverables-preview-panel deliverables-preview-panel--skeleton ${overlay ? 'deliverables-preview-panel--skeleton-overlay' : ''}`}
      aria-busy="true"
      aria-label="正在加载预览"
    >
      <div className="deliverable-preview-skeleton">
        <div className="deliverable-preview-skeleton__heading" />
        <div className="deliverable-preview-skeleton__subheading" />
        <div className="deliverable-preview-skeleton__paragraph">
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line deliverable-preview-skeleton__line--short" />
        </div>
        <div className="deliverable-preview-skeleton__heading deliverable-preview-skeleton__heading--section" />
        <div className="deliverable-preview-skeleton__paragraph">
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line deliverable-preview-skeleton__line--medium" />
          <div className="deliverable-preview-skeleton__line deliverable-preview-skeleton__line--short" />
        </div>
        <div className="deliverable-preview-skeleton__paragraph deliverable-preview-skeleton__paragraph--fade">
          <div className="deliverable-preview-skeleton__line" />
          <div className="deliverable-preview-skeleton__line deliverable-preview-skeleton__line--medium" />
        </div>
      </div>
    </div>
  );
}

const ArtifactTextPreview = memo(function ArtifactTextPreview({
  artifactId,
  fileKind,
  fileName,
}: {
  artifactId: string;
  fileKind: string;
  fileName: string;
}) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; content: string } | { status: 'error'; message: string }
  >({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void (async () => {
      try {
        const preview = await getArtifactPreview(artifactId, controller.signal);
        setState({ status: 'ready', content: preview.content });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '预览加载失败，请下载或在 new window 打开。',
        });
      }
    })();
    return () => controller.abort();
  }, [artifactId]);

  if (state.status === 'loading') {
    return <DeliverablePreviewSkeleton />;
  }
  if (state.status === 'error') {
    return (
      <div className="deliverables-preview-panel deliverables-preview-panel--error" role="alert">
        <strong>无法内联预览</strong>
        <span>{state.message}</span>
      </div>
    );
  }
  if (
    fileKind === 'markdown' ||
    fileKind === 'text' ||
    NORMALIZED_DOCUMENT_FILE_KINDS.has(fileKind) ||
    isNormalizedDocumentPreview(fileKind, fileName)
  ) {
    return (
      <DeliverableMarkdownPanel
        content={state.content}
        showFormatNotice={isNormalizedDocumentPreview(fileKind, fileName)}
      />
    );
  }
  if (fileKind === 'json') {
    return (
      <div className="deliverables-preview-panel deliverables-preview-panel--text">
        <pre>{state.content}</pre>
      </div>
    );
  }
  return (
    <div className="deliverables-preview-panel deliverables-preview-panel--text">
      <pre>{state.content}</pre>
    </div>
  );
});

function ArtifactHtmlDetailActions({ artifact }: { artifact: ArtifactRef }) {
  const previewUrl = getArtifactPreviewUrl(artifact.artifactId);
  return (
    <div className="artifact-html-detail-actions">
      <a
        className="secondary-button artifact-html-detail-actions__link"
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ArrowUpRight size={16} aria-hidden />
        在新窗口打开
      </a>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          void downloadArtifact(artifact.artifactId);
        }}
      >
        <Download size={16} aria-hidden />
        下载
      </button>
    </div>
  );
}

const ArtifactHtmlPreview = memo(function ArtifactHtmlPreview({
  artifact,
  previewUrl,
}: {
  artifact: ArtifactRef;
  previewUrl: string;
}) {
  const [frameState, setFrameState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    setFrameState('loading');
  }, [artifact.artifactId, previewUrl]);

  return (
    <div className="deliverables-preview-panel deliverables-preview-panel--iframe">
      {frameState === 'loading' ? <DeliverablePreviewSkeleton overlay /> : null}
      {frameState === 'error' ? (
        <div className="deliverables-preview-panel deliverables-preview-panel--error" role="alert">
          <strong>网页预览加载失败</strong>
          <span>请使用「在新窗口打开」或「下载」查看 {artifact.fileName}。</span>
          <ArtifactHtmlDetailActions artifact={artifact} />
        </div>
      ) : null}
      <iframe
        key={artifact.artifactId}
        className={`deliverables-preview-frame ${frameState === 'ready' ? 'is-ready' : ''}`}
        title={`预览 ${artifact.fileName}`}
        src={previewUrl}
        sandbox="allow-scripts allow-same-origin allow-popups"
        onLoad={() => setFrameState('ready')}
        onError={() => setFrameState('error')}
      />
    </div>
  );
}, (prev, next) =>
  prev.previewUrl === next.previewUrl &&
  prev.artifact.artifactId === next.artifact.artifactId &&
  prev.artifact.fileName === next.artifact.fileName,
);

function ArtifactFallbackPreview({
  artifact,
  previewUrl,
}: {
  artifact: ArtifactRef;
  previewUrl: string;
}) {
  const kind = artifact.fileKind.toUpperCase();
  return (
    <div className="deliverables-preview-panel deliverables-preview-panel--fallback">
      <strong>{kind} 文件暂不支持内联预览</strong>
      <span>下载或在浏览器新窗口中打开以查看完整内容。</span>
      <a className="secondary-button" href={previewUrl} target="_blank" rel="noreferrer">
        在新窗口打开
      </a>
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
    <div className="context-view context-view--panel">
      <div className="context-view__meta view-toolbar">
        <div>
          <span className="context-view__meta-title">模型轮次 {context.roundSequence}</span>
          <span>
            约 {context.estimatedInputTokens.toLocaleString()} 输入 token · 第 {context.attempt} 次尝试
          </span>
          {context.mcp ? (
            <span>
              MCP 目录 gen {context.mcp.catalogGeneration} · 已挂载 {context.mcp.toolCount} 个工具
            </span>
          ) : null}
        </div>
      </div>
      <JsonViewer
        value={context}
        copyAriaLabel="复制 Context JSON"
        regionAriaLabel="Context JSON"
      />
    </div>
  );
}

function ReportView({ report, sources: items }: { report: ReportView; sources: SourceView[] }) {
  return (
    <div className="report-view">
      <div className="view-toolbar">
        <div>
          <strong>{report.title}</strong>
          <span>{report.updated}</span>
        </div>
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
