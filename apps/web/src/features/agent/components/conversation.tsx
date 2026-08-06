import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleUserRound,
  Clock3,
  Copy,
  Globe2,
  LoaderCircle,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { MarkdownContent } from '../../../components/markdown-content';
import type {
  AgentUiState,
  RunCardState,
  ServiceState,
  ToolCallView,
  WorkbenchFocusTarget,
  WorkbenchState,
} from '../model/types';
import { AGENT_UI_BEHAVIOR, AGENT_UI_COPY } from '../config/ui.constants';

// 将消息创建时间格式化为当前本地时间。
function formatMessageTime(createdAt?: string, fallback?: string): string {
  if (createdAt) return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(createdAt));
  if (fallback && fallback !== '刚刚') return fallback;
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
}

// 提供仅在悬停或键盘聚焦时出现的消息复制操作。
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copyMessage(): Promise<void> {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), AGENT_UI_BEHAVIOR.copyFeedbackDurationMs);
  }
  return <button className="message-copy" type="button" aria-label={copied ? '已复制消息' : '复制消息'} title={copied ? '已复制' : '复制消息'} onClick={() => void copyMessage()}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>;
}

// 渲染消息时间线、运行卡片、错误提示和 Composer。
export function Conversation({
  state, error, onDismissError, onRunChange, onFocusWorkbench, onOpenWorkbench,
  prompt, submitting, serviceState, composerMode, onPromptChange, onSubmit,
}: {
  state: AgentUiState;
  error: string | null;
  onDismissError: () => void;
  onRunChange: (run: RunCardState) => void;
  onFocusWorkbench: (target: WorkbenchFocusTarget) => void;
  onOpenWorkbench: (workbench: WorkbenchState) => void;
  prompt: string;
  submitting: boolean;
  serviceState: ServiceState;
  composerMode: 'new-run' | 'steer' | 'clarification' | 'disabled';
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  function handleComposerSubmit(event: FormEvent<HTMLFormElement>): void { stickToBottomRef.current = true; onSubmit(event); }
  function handleConversationScroll(): void {
    const node = scrollRef.current;
    if (!node) return;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
    stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < AGENT_UI_BEHAVIOR.stickToBottomThresholdPx;
  }
  useEffect(() => {
    if (!stickToBottomRef.current || !scrollRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (stickToBottomRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    return () => { if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current); };
  }, [state.conversation]);

  return <section className="conversation" aria-label="对话">
    <div className="conversation-scroll" ref={scrollRef} onScroll={handleConversationScroll}>
      {state.conversation.length === 0 ? <div className="conversation-empty"><div className="empty-icon"><Sparkles size={22} /></div><h1>今天想完成什么任务？</h1></div> : <div className="message-list">
        {state.conversation.map((item) => item.kind === 'user' ? <div className="message message--user" key={item.id}>
          <div><div className="user-bubble"><MarkdownContent>{item.content}</MarkdownContent></div><div className="message-actions"><span>{formatMessageTime(item.createdAt, item.time)}</span><CopyButton text={item.content} /></div></div>
          <div className="message-avatar user-avatar" aria-hidden="true"><CircleUserRound size={17} /></div>
        </div> : item.kind === 'assistant' ? <div className="message message--assistant" key={item.id}>
          <div className="message-avatar assistant-avatar"><Sparkles size={15} /></div><div className="assistant-content"><div className="message-meta">Harness</div>{item.text !== undefined ? <MarkdownContent>{item.text}</MarkdownContent> : item.content}
            {item.workbench ? <button className="assistant-tool-summary" type="button" onClick={() => onOpenWorkbench(item.workbench!)}><Search size={14} /><span>{item.workbench.executions.length} 次检索 · {item.workbench.sources.length} 个线索</span><ChevronRight size={14} /></button> : null}
            <div className="message-actions"><span>{formatMessageTime(item.createdAt, item.time)}</span>{item.text !== undefined ? <CopyButton text={item.text} /> : null}</div>
          </div>
        </div> : <RunCard key={item.id} run={item.run} onChange={onRunChange} onFocusWorkbench={onFocusWorkbench} />)}
      </div>}
    </div>
    <div className="composer-area">{error ? <div className="error-notice" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="icon-button icon-button--small" type="button" aria-label="关闭错误提示" title="关闭错误提示" onClick={onDismissError}><X size={15} /></button></div> : null}
      <Composer prompt={prompt} submitting={submitting} serviceState={serviceState} mode={composerMode} onPromptChange={onPromptChange} onSubmit={handleComposerSubmit} />
    </div>
  </section>;
}

// 提供优先支持键盘操作的消息、调整和确认输入。
export function Composer({ prompt, submitting, serviceState, mode, onPromptChange, onSubmit }: {
  prompt: string; submitting: boolean; serviceState: ServiceState; mode: 'new-run' | 'steer' | 'clarification' | 'disabled';
  onPromptChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const placeholder = mode === 'steer' ? AGENT_UI_COPY.composerPlaceholders.steer : mode === 'clarification' ? AGENT_UI_COPY.composerPlaceholders.clarification : mode === 'disabled' ? AGENT_UI_COPY.composerPlaceholders.disabled : AGENT_UI_COPY.composerPlaceholders.newRun;
  return <form className="composer" onSubmit={onSubmit}><textarea aria-label="任务输入" placeholder={placeholder} rows={3} value={prompt} disabled={mode === 'disabled'} onChange={(event) => onPromptChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (prompt.trim() && !submitting && mode !== 'disabled') event.currentTarget.form?.requestSubmit(); } }} />
    <div className="composer-actions">{mode === 'steer' || mode === 'clarification' ? <div className="composer-hints"><SlidersHorizontal size={14} /><span>{mode === 'steer' ? AGENT_UI_COPY.composerHints.steer : AGENT_UI_COPY.composerHints.clarification}</span></div> : <span />}
      <button className="send-button" type="submit" aria-label="发送任务" title="发送任务" disabled={!prompt.trim() || submitting || serviceState !== 'ready' || mode === 'disabled'}>{submitting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button>
    </div>
  </form>;
}

// 汇总一次运行，并提供稳定控制和工具调用定位入口。
export function RunCard({ run, onChange, onFocusWorkbench }: { run: RunCardState; onChange: (run: RunCardState) => void; onFocusWorkbench: (target: WorkbenchFocusTarget) => void }) {
  const [expanded, setExpanded] = useState(run.status === 'running' || run.status === 'waiting');
  const statusIcon: Record<RunCardState['status'], LucideIcon> = { running: LoaderCircle, completed: Check, waiting: Clock3, cancelling: LoaderCircle, cancelled: X, failed: CircleAlert };
  const Icon = statusIcon[run.status];
  const canCancel = run.status === 'running' || run.status === 'waiting';
  const isBusy = run.status === 'running' || run.status === 'cancelling';
  const focusedTool = run.toolCalls.at(-1);
  const openTool = (tool: ToolCallView): void => onFocusWorkbench({ kind: 'tool_call', runId: tool.runId, stepId: tool.stepId, toolCallId: tool.toolCallId });
  return <div className={`run-card run-card--${run.status}`}>
    <div className="run-card-header"><button className="run-card-main" type="button" aria-label={`打开 ${run.stage} 的工作台`} onClick={() => focusedTool ? openTool(focusedTool) : onFocusWorkbench({ kind: 'activity', runId: run.runId })}><span className="run-status-icon"><Icon className={isBusy ? 'spin' : ''} size={16} /></span><span className="run-card-title"><strong>{run.stage}</strong><span>{run.currentAction}</span></span><span className="run-card-time">{run.elapsed}</span></button>
      <button className="icon-button icon-button--small run-toggle" type="button" aria-label={expanded ? '收起运行详情' : '展开运行详情'} title={expanded ? '收起运行详情' : '展开运行详情'} onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
    </div>
    {run.status === 'completed' && !expanded ? <div className="run-summary">{run.summary}</div> : null}
    <div className={`run-card-collapse ${expanded ? 'is-expanded' : ''}`} aria-hidden={!expanded} inert={!expanded}><div className="run-card-collapse-inner"><div className="run-card-body">
      <div className="run-progress"><span><Globe2 size={14} />{run.queryCount} 次检索</span><span><Search size={14} />{run.sourceCount} 个来源</span></div>
      <div className="run-progress-steps" aria-label="运行阶段">{run.progress.map((item) => <span className={`progress-step progress-step--${item.status}`} key={item.id}>{item.status === 'completed' ? <Check size={12} /> : <span className="event-mark" />}{item.label}</span>)}</div>
      <div className="tool-call-list"><div className="section-label">工具调用</div>{run.toolCalls.map((tool) => { const ToolIcon = tool.status === 'completed' ? Check : tool.status === 'failed' ? CircleAlert : tool.status === 'waiting' ? Clock3 : tool.status === 'cancelled' ? X : LoaderCircle; const toolBusy = tool.status === 'running' || tool.status === 'cancelling'; return <button className="tool-call-row" type="button" key={tool.toolCallId} onClick={() => openTool(tool)}><span className={`tool-call-status tool-call-status--${tool.status}`}><ToolIcon className={toolBusy ? 'spin' : ''} size={13} /></span><span><strong>{tool.title}</strong><small>{tool.detail}</small></span><ChevronRight size={14} /></button>; })}</div>
      {canCancel ? <div className="run-controls"><button className="text-button danger" type="button" onClick={() => { const toolCalls = run.toolCalls.map((tool, index, items) => index === items.length - 1 ? { ...tool, status: 'cancelling' as const, outputSummary: '正在停止当前搜索请求' } : tool); onChange({ ...run, status: 'cancelling', stage: '正在取消', currentAction: '正在安全停止当前步骤', toolCalls }); }}><X size={15} />取消</button></div> : null}
    </div></div></div>
  </div>;
}
