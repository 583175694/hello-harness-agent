import {
  ArrowUpRight,
  Braces,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  PanelRight,
  Search,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MarkdownContent } from '../../../components/markdown-content';
import { useConfirm } from '../../../components/ui/confirm-provider';
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
import { downloadArtifact, getArtifactPreviewUrl } from '../../../api/client';

const WORKBENCH_TABS: Array<{ id: WorkspaceView; label: string; icon: LucideIcon }> = [
  { id: 'tool_results', label: '工具结果', icon: Wrench },
  { id: 'deliverables', label: '交付物', icon: FileText },
  { id: 'context', label: 'Context', icon: Braces },
];

export function resolveToolCallIndex(
  executions: ToolCallView[],
  focusTarget?: WorkbenchFocusTarget,
): number {
  if (!executions.length) return 0;
  if (focusTarget?.kind === 'tool_call') {
    const index = executions.findIndex((tool) => tool.toolCallId === focusTarget.toolCallId);
    if (index >= 0) return index;
  }
  return executions.length - 1;
}

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
  const toolIndex = resolveToolCallIndex(state.executions, state.focusTarget);
  const showToolSlider =
    state.activeView === 'tool_results' && state.executions.length > 1;

  return (
    <aside
      className={`resource-workspace flex h-full min-h-0 min-w-0 flex-col text-text-primary ${state.open ? 'is-open' : ''}`}
      aria-label="工作区"
      aria-hidden={!state.open}
      inert={!state.open}
    >
      <header className="workbench-chrome">
        <div className="workbench-chrome__top">
          <div className="workbench-chrome__heading">
            <PanelRight size={15} className="workbench-chrome__icon" aria-hidden />
            <span className="workbench-chrome__kicker">工作台</span>
            <span className="workbench-chrome__sep" aria-hidden />
            <h2 className="workbench-chrome__title">{state.title}</h2>
          </div>
          <button
            className="icon-button workbench-chrome__close"
            type="button"
            aria-label="收起工作区"
            title="收起工作区"
            onClick={onClose}
          >
            <PanelRight size={17} />
          </button>
        </div>
        {state.subtitle ? <p className="workbench-chrome__subtitle">{state.subtitle}</p> : null}
        <div className="workspace-tabs workbench-chrome__tabs" role="tablist" aria-label="工作区视图">
          {WORKBENCH_TABS.map(({ id, label, icon: TabIcon }) => (
            <button
              className={`workspace-tab ${state.activeView === id ? 'is-active' : ''}`}
              key={id}
              type="button"
              role="tab"
              aria-selected={state.activeView === id}
              onClick={() => onViewChange(id)}
            >
              <TabIcon size={15} />
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="workspace-content workbench-stage flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <WorkbenchActiveView
            state={state}
            toolIndex={toolIndex}
            onExecutionSelect={onExecutionSelect}
            onReviseArtifact={onReviseArtifact}
            onRestoreArtifact={onRestoreArtifact}
          />
        </div>
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
    </aside>
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
  return (
    <footer className="workbench-tool-slider">
      <div className="workbench-tool-slider__label">
        工具调用 {index + 1} / {executions.length}
      </div>
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
  toolIndex,
  onSelectByIndex,
}: {
  executions: ToolCallView[];
  sources: SourceView[];
  toolIndex: number;
  onSelectByIndex: (index: number) => void;
}) {
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
      <div className="execution-empty m-4">暂无工具调用结果，完成一次工具执行后会显示在这里。</div>
    );
  }

  const canPrev = toolIndex > 0;
  const canNext = toolIndex < executions.length - 1;

  return (
    <div className="tool-results-view">
      <div className="workbench-subheader">
        <div className="workbench-subheader__main">
          <span className="workbench-subheader__eyebrow">当前</span>
          <strong className="workbench-subheader__title">
            {selectedTool?.title ?? selectedTool?.toolName ?? '工具调用'}
          </strong>
          {selectedTool ? (
            <span className="workbench-subheader__meta">{selectedTool.elapsed}</span>
          ) : null}
        </div>
        <div className="workbench-subheader__nav">
          <button
            className="icon-button"
            type="button"
            aria-label="上一项工具调用"
            disabled={!canPrev}
            onClick={() => onSelectByIndex(toolIndex - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="下一项工具调用"
            disabled={!canNext}
            onClick={() => onSelectByIndex(toolIndex + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      {selectedTool ? (
        <ToolResultBody tool={selectedTool} sources={relatedSources} />
      ) : (
        <div className="execution-empty">执行详情暂不可用</div>
      )}
    </div>
  );
}

function ToolResultBody({ tool, sources }: { tool: ToolCallView; sources: SourceView[] }) {
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
  return (
    <article className="execution-detail" key={tool.toolCallId} tabIndex={-1}>
      <div className="execution-detail-heading">
        <div>
          <span className="tool-name">{tool.toolName}</span>
          <h3>{tool.title}</h3>
        </div>
        <span className={`execution-status execution-status--${tool.status}`}>{tool.status}</span>
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

function sourceCaption(source: SourceView): string {
  if (source.kind === 'clue') return '搜索线索，尚未读取正文';
  if (source.used) return '回答采用的已读来源';
  return '已读取并保存相关原文';
}

function SourcesView({ sources: items, compact }: { sources: SourceView[]; compact?: boolean }) {
  const usedCount = items.filter((source) => source.kind === 'fetched' && source.used).length;
  const fetchedCount = items.filter((source) => source.kind === 'fetched').length;
  const clueCount = items.filter((source) => source.kind === 'clue').length;
  const sourceSummary = fetchedCount
    ? `${usedCount} 个回答采用 · ${fetchedCount} 个已读取 · ${clueCount} 个搜索线索`
    : `${clueCount} 个搜索线索`;
  return (
    <div className={`sources-view ${compact ? 'sources-view--compact' : ''}`}>
      {!compact ? (
        <div className="view-toolbar">
          <div>
            <strong>来源</strong>
            <span>{sourceSummary}</span>
          </div>
          <button className="icon-button" type="button" aria-label="筛选来源" title="筛选来源">
            <SlidersHorizontal size={16} />
          </button>
        </div>
      ) : null}
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

function DeliverablesView({
  state,
  onRevise,
  onRestore,
}: {
  state: WorkbenchState;
  onRevise?: (artifact: ArtifactRef) => void;
  onRestore?: (artifact: ArtifactRef) => void;
}) {
  const artifacts = collectDeliverableArtifacts(state);
  const focusArtifactId =
    state.focusTarget?.kind === 'artifact' ? state.focusTarget.artifactId : undefined;
  const [selectedId, setSelectedId] = useState<string | undefined>(
    focusArtifactId ?? artifacts.find((item) => item.isCurrent)?.artifactId ?? artifacts.at(-1)?.artifactId,
  );

  useEffect(() => {
    if (focusArtifactId) setSelectedId(focusArtifactId);
  }, [focusArtifactId]);

  const selected =
    artifacts.find((item) => item.artifactId === selectedId) ?? artifacts.at(-1);

  if (state.report && !artifacts.length) {
    return <ReportView report={state.report} sources={state.sources} />;
  }

  if (!artifacts.length) {
    return (
      <div className="deliverables-empty m-4">
        <strong>暂无交付物</strong>
        <span>模型生成的报告、网页或文件会出现在这里。</span>
      </div>
    );
  }

  if (!state.artifactSeries?.length && artifacts.length > 1) {
    return (
      <div className="deliverables-view deliverables-view--list">
        {artifacts.map((artifact) => (
          <ArtifactDetailPanel
            key={artifact.artifactId}
            artifact={artifact}
            onRevise={onRevise}
            onRestore={onRestore}
          />
        ))}
      </div>
    );
  }

  const seriesVersions = selected?.seriesId
    ? artifacts.filter((item) => item.seriesId === selected.seriesId)
    : artifacts;

  return (
    <div className="deliverables-view">
      <div className="workbench-subheader view-toolbar">
        <div className="deliverables-breadcrumb">
          <span>交付物</span>
          <ChevronRight size={14} aria-hidden />
          <strong>{selected?.logicalName ?? selected?.fileName ?? '文件'}</strong>
          {selected?.versionNumber ? (
            <>
              <ChevronRight size={14} aria-hidden />
              <span>v{selected.versionNumber}</span>
            </>
          ) : null}
        </div>
        {seriesVersions.length > 1 ? (
          <div className="deliverables-version-chips" role="tablist" aria-label="版本">
            {seriesVersions.map((artifact) => (
              <button
                key={artifact.artifactId}
                type="button"
                role="tab"
                aria-selected={artifact.artifactId === selected?.artifactId}
                className={`deliverables-version-chip ${artifact.artifactId === selected?.artifactId ? 'is-active' : ''}`}
                onClick={() => setSelectedId(artifact.artifactId)}
              >
                v{artifact.versionNumber ?? 1}
                {artifact.isCurrent ? ' · 当前' : ''}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {selected ? (
        <ArtifactDetailPanel artifact={selected} onRevise={onRevise} onRestore={onRestore} />
      ) : null}
      {state.report ? (
        <div className="deliverables-report-addon">
          <ReportView report={state.report} sources={state.sources} />
        </div>
      ) : null}
    </div>
  );
}

function ArtifactDetailPanel({
  artifact,
  onRevise,
  onRestore,
}: {
  artifact: ArtifactRef;
  onRevise?: (artifact: ArtifactRef) => void;
  onRestore?: (artifact: ArtifactRef) => void;
}) {
  const confirm = useConfirm();
  const previewUrl = getArtifactPreviewUrl(artifact.artifactId);
  const isHtml = artifact.fileKind === 'html' || artifact.mediaType === 'text/html';

  return (
    <article className="artifact-workbench-item">
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
            {artifact.isCurrent ? <span className="artifact-current-badge">当前版本</span> : null}
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
        <a className="secondary-button" href={previewUrl} target="_blank" rel="noreferrer">
          在新窗口打开
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
                onRestore(artifact);
              })();
            }}
          >
            恢复此版本
          </button>
        ) : null}
      </div>
      {isHtml ? (
        <iframe
          className="deliverables-preview-frame"
          title={`预览 ${artifact.fileName}`}
          src={previewUrl}
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <a className="secondary-button deliverables-preview-link" href={previewUrl} target="_blank" rel="noreferrer">
          预览
        </a>
      )}
    </article>
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
      <div className="view-toolbar m-4">
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
