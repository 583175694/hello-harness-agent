import {
  Check,
  ChevronRight,
  CircleAlert,
  CircleUserRound,
  Copy,
  LoaderCircle,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { MarkdownContent } from '../../../components/markdown-content';
import type {
  AgentUiState,
  ServiceState,
  WorkbenchFocusTarget,
} from '../model/types';
import { flattenAssistantText } from '../model/conversation-blocks';
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
  state, error, onDismissError, onFocusWorkbench,
  prompt, submitting, serviceState, composerMode, onPromptChange, onSubmit,
}: {
  state: AgentUiState;
  error: string | null;
  onDismissError: () => void;
  onFocusWorkbench: (target: WorkbenchFocusTarget) => void;
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
        </div> : <div className="message message--assistant" key={item.id}>
          <div className="message-avatar assistant-avatar"><Sparkles size={15} /></div><div className="assistant-content"><div className="message-meta">Harness</div>
            {item.pending && item.blocks.length === 0 ? <p className="assistant-thinking" role="status" aria-live="polite">正在思考中…</p> : null}
            <div className="assistant-blocks">{item.blocks.map((block) => block.type === 'text'
              ? <div className="assistant-text-block" key={block.id}><MarkdownContent>{block.content}</MarkdownContent></div>
              : <ToolActivity key={block.id} block={block} messageId={item.workbench?.runId ?? item.id} canOpenWorkbench={Boolean(item.workbench)} onFocusWorkbench={onFocusWorkbench} />)}</div>
            <div className="message-actions"><span>{formatMessageTime(item.createdAt, item.time)}</span>{flattenAssistantText(item.blocks) ? <CopyButton text={flattenAssistantText(item.blocks)} /> : null}</div>
          </div>
        </div>)}
      </div>}
    </div>
    <div className="composer-area">{error ? <div className="error-notice" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="icon-button icon-button--small" type="button" aria-label="关闭错误提示" title="关闭错误提示" onClick={onDismissError}><X size={15} /></button></div> : null}
      <Composer prompt={prompt} submitting={submitting} serviceState={serviceState} mode={composerMode} onPromptChange={onPromptChange} onSubmit={handleComposerSubmit} />
    </div>
  </section>;
}

// 在 assistant 内容流中展示一次工具调用，并允许定位对应 Workbench 详情。
function ToolActivity({ block, messageId, canOpenWorkbench, onFocusWorkbench }: {
  block: Extract<AgentUiState['conversation'][number], { kind: 'assistant' }>['blocks'][number] & { type: 'tool_activity' };
  messageId: string;
  canOpenWorkbench: boolean;
  onFocusWorkbench: (target: WorkbenchFocusTarget) => void;
}) {
  const statusLabels = {
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  } as const;
  const Icon = block.status === 'completed' ? Check : block.status === 'failed' ? CircleAlert : block.status === 'cancelled' ? X : LoaderCircle;
  const duration = block.durationMs === undefined
    ? undefined
    : block.durationMs < 1000 ? `${block.durationMs} 毫秒` : `${(block.durationMs / 1000).toFixed(1)} 秒`;
  return <button
    className={`tool-activity tool-activity--${block.status}`}
    type="button"
    disabled={!canOpenWorkbench}
    aria-label={`${block.title}，${statusLabels[block.status]}`}
    onClick={() => onFocusWorkbench({ kind: 'tool_call', runId: messageId, stepId: block.toolCallId, toolCallId: block.toolCallId })}
  >
    <span className="tool-activity__icon"><Icon className={block.status === 'running' ? 'spin' : ''} size={15} /></span>
    <span className="tool-activity__body"><strong>{block.title}</strong>{block.summary ? <small>{block.summary}</small> : null}</span>
    <span className="tool-activity__meta">{duration ?? statusLabels[block.status]}</span>
    {canOpenWorkbench ? <ChevronRight size={14} /> : null}
  </button>;
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
