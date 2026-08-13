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
  Square,
  X,
} from 'lucide-react';
import { memo, useLayoutEffect, useRef, useState, type FormEvent } from 'react';

import { MarkdownContent } from '../../../components/markdown-content';
import type { AgentUiState, ServiceState, WorkbenchFocusTarget } from '../model/types';
import { flattenAssistantText } from '../model/conversation-blocks';
import { AGENT_UI_BEHAVIOR, AGENT_UI_COPY } from '../config/ui.constants';

// 将消息创建时间格式化为当前本地时间。
function formatMessageTime(createdAt?: string, fallback?: string): string {
  if (createdAt)
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(createdAt));
  if (fallback && fallback !== '刚刚') return fallback;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

// 提供仅在悬停或键盘聚焦时出现的消息复制操作。
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copyMessage(): Promise<void> {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), AGENT_UI_BEHAVIOR.copyFeedbackDurationMs);
  }
  return (
    <button
      className="message-copy"
      type="button"
      aria-label={copied ? '已复制消息' : '复制消息'}
      title={copied ? '已复制' : '复制消息'}
      onClick={() => void copyMessage()}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

type ConversationItem = AgentUiState['conversation'][number];
type AssistantItem = Extract<ConversationItem, { kind: 'assistant' }>;

// 流式事件只会改变当前 Assistant Item；隔离消息行可以避免每个 token 重建整条历史消息树。
const UserMessage = memo(function UserMessage({
  item,
}: {
  item: Extract<ConversationItem, { kind: 'user' }>;
}) {
  return (
    <div className="message message--user flex justify-end gap-3 text-text-primary">
      <div>
        <div className="user-bubble max-w-[min(820px,calc(100vw-72px))] rounded-[8px_8px_3px_8px] bg-surface-subtle text-text-primary">
          <MarkdownContent>{item.content}</MarkdownContent>
        </div>
        <div className="message-actions">
          <span>{formatMessageTime(item.createdAt, item.time)}</span>
          <CopyButton text={item.content} />
        </div>
      </div>
      <div className="message-avatar user-avatar" aria-hidden="true">
        <CircleUserRound size={17} />
      </div>
    </div>
  );
});

const AssistantMessage = memo(
  function AssistantMessage({
    item,
    onFocusWorkbench,
  }: {
    item: AssistantItem;
    onFocusWorkbench: (target: WorkbenchFocusTarget) => void;
  }) {
    const text = flattenAssistantText(item.blocks);
    return (
      <div className="message message--assistant flex gap-3 text-text-primary">
        <div className="message-avatar assistant-avatar">
          <Sparkles size={15} />
        </div>
        <div className="assistant-content min-w-0 max-w-[680px] text-text-primary">
          <div className="message-meta">Harness</div>
          {item.deliveryStatus === 'cancelled' ? (
            <div className="assistant-delivery-status">本次回答已取消</div>
          ) : item.deliveryStatus === 'failed' ? (
            <div className="assistant-delivery-status">本次回答未完成</div>
          ) : null}
          {item.pending &&
          !item.blocks.some((block) => block.type === 'text' && block.content.trim()) ? (
            <p className="assistant-thinking" role="status" aria-live="polite">
              正在思考中…
            </p>
          ) : null}
          <div className="assistant-blocks">
            {item.blocks.map((block) =>
              block.type === 'text' ? (
                <div className="assistant-text-block" key={block.id}>
                  <MarkdownContent>{block.content}</MarkdownContent>
                </div>
              ) : (
                <ToolActivity
                  key={block.id}
                  block={block}
                  messageId={item.workbench?.runId ?? item.id}
                  canOpenWorkbench={Boolean(item.workbench)}
                  onFocusWorkbench={onFocusWorkbench}
                />
              ),
            )}
          </div>
          <div className="message-actions">
            <span>{formatMessageTime(item.createdAt, item.time)}</span>
            {text ? <CopyButton text={text} /> : null}
          </div>
        </div>
      </div>
    );
  },
  // 回调由上层渲染时重新创建，但它只通过 ref 定位当前会话，不影响消息内容。
  (previous, next) => previous.item === next.item,
);

// 渲染消息时间线、内联工具活动、错误提示和 Composer。
export function Conversation({
  state,
  error,
  onDismissError,
  onFocusWorkbench,
  prompt,
  submitting,
  serviceState,
  composerMode,
  onPromptChange,
  onSubmit,
  onCancel,
  onReconnect,
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
  onCancel?: () => void;
  onReconnect?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  function handleComposerSubmit(event: FormEvent<HTMLFormElement>): void {
    stickToBottomRef.current = true;
    onSubmit(event);
  }
  function handleConversationScroll(): void {
    const node = scrollRef.current;
    if (!node) return;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
    stickToBottomRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight <
      AGENT_UI_BEHAVIOR.stickToBottomThresholdPx;
  }
  // 在浏览器绘制前同步到底部，避免新 token 先以旧 scrollTop 绘制一帧后再跳动。
  useLayoutEffect(() => {
    if (!stickToBottomRef.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [state.conversation]);

  return (
    <section className="conversation flex min-h-0 min-w-0 flex-col bg-surface text-text-primary" aria-label="对话">
      <div className="conversation-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto" ref={scrollRef} onScroll={handleConversationScroll}>
        {state.conversation.length === 0 ? (
          <div className="conversation-empty flex min-h-[500px] flex-col items-center justify-center gap-3 text-text-muted">
            <div className="empty-icon grid h-[50px] w-[50px] place-items-center rounded-xl border border-border bg-surface-subtle text-text-secondary">
              <Sparkles size={22} />
            </div>
            <h1 className="m-0 text-[19px] font-semibold text-text-primary">今天想完成什么任务？</h1>
          </div>
        ) : (
          <div className="message-list mx-auto w-[min(820px,calc(100%-72px))] py-[34px] pb-[22px] max-[1180px]:w-[min(760px,calc(100%-48px))] max-[900px]:w-[min(720px,calc(100%-36px))] max-[720px]:w-[calc(100%-24px)]">
            {state.conversation.map((item) =>
              item.kind === 'user' ? (
                <UserMessage key={item.id} item={item} />
              ) : (
                <AssistantMessage key={item.id} item={item} onFocusWorkbench={onFocusWorkbench} />
              ),
            )}
          </div>
        )}
      </div>
      <div className="composer-area mx-auto w-[min(820px,calc(100%-72px))] bg-surface pb-6 max-[1180px]:w-[min(760px,calc(100%-48px))] max-[900px]:w-[min(720px,calc(100%-36px))] max-[720px]:w-[calc(100%-24px)]">
        {error ? (
          <div className="error-notice" role="alert">
            <CircleAlert size={17} />
            <span>{error}</span>
            {onReconnect ? (
              <button className="text-button" type="button" onClick={onReconnect}>
                重新连接
              </button>
            ) : null}
            <button
              className="icon-button icon-button--small"
              type="button"
              aria-label="关闭错误提示"
              title="关闭错误提示"
              onClick={onDismissError}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}
        <Composer
          prompt={prompt}
          submitting={submitting}
          serviceState={serviceState}
          mode={composerMode}
          onPromptChange={onPromptChange}
          onSubmit={handleComposerSubmit}
          onCancel={onCancel}
        />
      </div>
    </section>
  );
}

// 在 assistant 内容流中展示一次工具调用，并允许定位对应 Workbench 详情。
function ToolActivity({
  block,
  messageId,
  canOpenWorkbench,
  onFocusWorkbench,
}: {
  block: Extract<AgentUiState['conversation'][number], { kind: 'assistant' }>['blocks'][number] & {
    type: 'tool_activity';
  };
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
  const Icon =
    block.status === 'completed'
      ? Check
      : block.status === 'failed'
        ? CircleAlert
        : block.status === 'cancelled'
          ? X
          : LoaderCircle;
  const meta = block.status === 'completed' ? undefined : statusLabels[block.status];
  return (
    <button
      className={`tool-activity tool-activity--${block.status}`}
      type="button"
      disabled={!canOpenWorkbench}
      aria-label={`${block.title}，${statusLabels[block.status]}`}
      title={canOpenWorkbench ? '在工作台查看详情' : undefined}
      onClick={() =>
        onFocusWorkbench({
          kind: 'tool_call',
          runId: messageId,
          stepId: block.toolCallId,
          toolCallId: block.toolCallId,
        })
      }
    >
      <span className="tool-activity__icon">
        <Icon className={block.status === 'running' ? 'spin' : ''} size={14} />
      </span>
      <span className="tool-activity__body">
        <strong>{block.title}</strong>
        {block.summary ? <small>{block.summary}</small> : null}
        {canOpenWorkbench ? (
          <ChevronRight className="tool-activity__open-hint" size={14} aria-hidden="true" />
        ) : null}
      </span>
      {meta ? <span className="tool-activity__meta">{meta}</span> : null}
    </button>
  );
}

// 提供优先支持键盘操作的消息、调整和确认输入。
export function Composer({
  prompt,
  submitting,
  serviceState,
  mode,
  onPromptChange,
  onSubmit,
  onCancel,
}: {
  prompt: string;
  submitting: boolean;
  serviceState: ServiceState;
  mode: 'new-run' | 'steer' | 'clarification' | 'disabled';
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  const composingRef = useRef(false);
  const placeholder =
    mode === 'steer'
      ? AGENT_UI_COPY.composerPlaceholders.steer
      : mode === 'clarification'
        ? AGENT_UI_COPY.composerPlaceholders.clarification
        : mode === 'disabled'
          ? AGENT_UI_COPY.composerPlaceholders.disabled
          : AGENT_UI_COPY.composerPlaceholders.newRun;
  return (
    <form className="composer overflow-hidden rounded-[14px] border border-[var(--theme-composer-border)] bg-surface shadow-[0_8px_24px_rgb(0_0_0_/_3%)]" onSubmit={onSubmit}>
      {submitting ? (
        <div className="composer-running-status" role="status" aria-live="polite">
          <span className="activity-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>AI 正在回复</span>
        </div>
      ) : null}
      <textarea
        aria-label="任务输入"
        placeholder={placeholder}
        rows={3}
        value={prompt}
        disabled={mode === 'disabled'}
        onChange={(event) => onPromptChange(event.target.value)}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            // 中文等输入法正在确认候选词时，Enter 只结束组合输入，不提交消息。
            if (
              composingRef.current ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            )
              return;
            event.preventDefault();
            if (prompt.trim() && !submitting && mode !== 'disabled')
              event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="composer-actions flex min-h-12 items-center justify-between px-[15px] py-[5px] pr-2 text-xs text-text-muted">
        {mode === 'steer' || mode === 'clarification' ? (
          <div className="composer-hints">
            <SlidersHorizontal size={14} />
            <span>
              {mode === 'steer'
                ? AGENT_UI_COPY.composerHints.steer
                : AGENT_UI_COPY.composerHints.clarification}
            </span>
          </div>
        ) : (
          <span />
        )}
        <button
          className="send-button"
          type={submitting ? 'button' : 'submit'}
          aria-label={submitting ? '停止任务' : '发送任务'}
          title={submitting ? '停止任务' : '发送任务'}
          disabled={
            submitting
              ? !onCancel
              : !prompt.trim() || serviceState !== 'ready' || mode === 'disabled'
          }
          onClick={submitting ? onCancel : undefined}
        >
          {submitting ? <Square size={14} fill="currentColor" /> : <Send size={18} />}
        </button>
      </div>
    </form>
  );
}
