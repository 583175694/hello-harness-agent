import {
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  CircleUserRound,
  Copy,
  CornerDownLeft,
  Ellipsis,
  LoaderCircle,
  Paperclip,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';

import { MarkdownContent } from '../../../components/markdown-content';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import type {
  AgentUiState,
  ServiceState,
  WorkbenchFocusTarget,
  WorkbenchState,
} from '../model/types';
import type {
  InterruptSnapshot,
  PlanSnapshot,
  PublicModelConfig,
  ReasoningEffort,
  ToolApprovalDecision,
  FileRef,
} from '@harness/agent-protocol';
import type { PendingUserInputView } from '@harness/agent-protocol';
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

type RenderedConversationItem = Extract<ConversationItem, { kind: 'user' }> | AssistantItem;

// 将图片以顶层遮罩形式展示，并统一处理点击遮罩、关闭按钮和 Esc 退出。
function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  // 挂载到 document.body，避免页面层叠上下文（尤其是 Composer）覆盖全屏预览。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <button
        type="button"
        className="image-lightbox__close"
        aria-label="关闭图片预览"
        title="关闭预览"
        onClick={onClose}
      >
        <X size={22} />
      </button>
      <img src={src} alt={alt} onMouseDown={(event) => event.stopPropagation()} />
    </div>,
    document.body,
  );
}

// 将一个包含 Steer 边界标记的 assistant draft 拆成可混排的顶层消息。
// Steer 使用同一条 UserMessage 组件渲染，避免在 assistant 容器内维护第二套用户气泡。
function expandConversationItem(item: ConversationItem): RenderedConversationItem[] {
  if (item.kind !== 'assistant' || !item.blocks.some((block) => block.type === 'user_intervention'))
    return [item];
  const result: RenderedConversationItem[] = [];
  let assistantBlocks: AssistantItem['blocks'] = [];
  let segment = 0;
  const flushAssistant = () => {
    if (!assistantBlocks.length) return;
    result.push({ ...item, id: `${item.id}:segment:${segment++}`, blocks: assistantBlocks });
    assistantBlocks = [];
  };
  for (const block of item.blocks) {
    if (block.type !== 'user_intervention') {
      assistantBlocks.push(block);
      continue;
    }
    flushAssistant();
    result.push({
      id: `${item.id}:intervention:${block.inputId}`,
      kind: 'user',
      content: block.content,
      pendingInputId: block.inputId,
      pendingState: 'steer_applied',
      createdAt: item.createdAt,
    });
  }
  flushAssistant();
  return result;
}

function expandConversation(conversation: ConversationItem[]): RenderedConversationItem[] {
  return conversation.flatMap(expandConversationItem);
}

// 流式事件只会改变当前 Assistant Item；隔离消息行可以避免每个 token 重建整条历史消息树。
// 将用户附件作为独立媒体块展示，避免图片撑进文本消息气泡。
const UserMessage = memo(function UserMessage({
  item,
}: {
  item: Extract<ConversationItem, { kind: 'user' }>;
}) {
  // 用户消息将附件独立渲染在文本气泡上方，点击后打开全屏预览。
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  return (
    <div className="message message--user flex justify-end gap-3 text-text-primary">
      <div>
        {item.attachments?.length ? (
          <div className="user-attachment-stack">
            {item.attachments.map((attachment) => (
              <button
                key={attachment.fileId}
                type="button"
                className="user-attachment-button"
                aria-label={`预览${attachment.fileName}`}
                onClick={() =>
                  attachment.previewUrl &&
                  setPreview({ src: attachment.previewUrl, alt: attachment.fileName })
                }
              >
                <img src={attachment.previewUrl} alt={attachment.fileName} className="user-attachment-tile" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="user-bubble max-w-[min(820px,calc(100vw-72px))] rounded-[8px_8px_3px_8px] bg-surface-subtle text-text-primary">
          <MarkdownContent>{item.content}</MarkdownContent>
        </div>
        <div className="message-actions">
          {item.pendingState === 'steer_pending' ? <span>等待下一步骤应用</span> : null}
          {item.pendingState === 'steer_applied' ? <span>已应用到当前任务</span> : null}
          {item.pendingState === 'follow_up_pending' ? <span>等待下一轮处理</span> : null}
          <span>{formatMessageTime(item.createdAt, item.time)}</span>
          <CopyButton text={item.content} />
        </div>
      </div>
      <div className="message-avatar user-avatar" aria-hidden="true">
        <CircleUserRound size={17} />
      </div>
      {preview ? (
        <ImageLightbox src={preview.src} alt={preview.alt} onClose={() => setPreview(null)} />
      ) : null}
    </div>
  );
});

const AssistantMessage = memo(
  function AssistantMessage({
    item,
    showThinking,
    isAnimating,
    onFocusWorkbench,
  }: {
    item: AssistantItem;
    showThinking: boolean;
    isAnimating: boolean;
    onFocusWorkbench: (target: WorkbenchFocusTarget) => void;
  }) {
    const text = flattenAssistantText(item.blocks);
    const hasVisibleBlocks = item.blocks.some(
      (block) => block.type === 'text' || block.type === 'tool_activity',
    );
    return (
      <div className="message message--assistant flex gap-3 text-text-primary">
        <div className="message-avatar assistant-avatar">
          <Sparkles size={15} />
        </div>
        <div className="assistant-content w-full text-text-primary">
          <div className="message-meta">Harness</div>
          {item.deliveryStatus === 'cancelled' ? (
            <div className="assistant-delivery-status">本次回答已取消</div>
          ) : item.deliveryStatus === 'failed' ? (
            <div className="assistant-delivery-status">本次回答未完成</div>
          ) : null}
          {showThinking ? (
            <p
              className={hasVisibleBlocks ? 'sr-only' : 'assistant-thinking'}
              role="status"
              aria-label="AI 正在回复"
              aria-live="polite"
            >
              {hasVisibleBlocks ? 'AI 正在回复' : '正在思考中…'}
            </p>
          ) : null}
          <div className="assistant-blocks">
            {item.blocks.map((block) =>
              block.type === 'text' ? (
                <div className="assistant-text-block" key={block.id}>
                  <MarkdownContent isAnimating={isAnimating}>{block.content}</MarkdownContent>
                </div>
              ) : block.type === 'tool_activity' ? (
                <ToolActivity
                  key={block.id}
                  block={block}
                  messageId={item.workbench?.runId ?? item.id}
                  canOpenWorkbench={Boolean(item.workbench)}
                  onFocusWorkbench={onFocusWorkbench}
                />
              ) : null,
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
  (previous, next) =>
    previous.item === next.item &&
    previous.showThinking === next.showThinking &&
    previous.isAnimating === next.isAnimating,
);

// 展示运行中的 Follow-up 队列及其可用操作。
function FollowUpQueue({
  state,
  pendingInputs,
  submitting,
  onPromotePending,
  onCancelPending,
  onSendPending,
}: {
  state: AgentUiState;
  pendingInputs: PendingUserInputView[];
  submitting: boolean;
  onPromotePending?: (inputId: string) => void;
  onCancelPending?: (inputId: string) => void;
  onSendPending?: (inputId: string) => void;
}) {
  const queuedInputs = pendingInputs.filter(
    (item) => item.status === 'pending' && item.kind === 'follow_up',
  );
  const canSendPending =
    !submitting &&
    Boolean(onSendPending) &&
    !state.activeRunId &&
    (state.workbench?.activityStatus === 'failed' ||
      state.workbench?.activityStatus === 'cancelled' ||
      state.workbench?.activityStatus === 'completed');
  return (
    <>
      {queuedInputs.length ? (
        <div className="pending-input-stack">
          {queuedInputs.map((item) => (
            <article className="pending-input-card" key={item.id}>
              <div className="pending-input-card__content">
                <CornerDownLeft size={16} aria-hidden="true" />
                <span>{item.content}</span>
              </div>
              <div className="pending-input-card__actions">
                {canSendPending ? (
                  <button
                    className="pending-input-card__steer"
                    type="button"
                    onClick={() => onSendPending?.(item.id)}
                  >
                    <ArrowUp size={15} strokeWidth={2.25} aria-hidden="true" />
                    发送
                  </button>
                ) : null}
                {onPromotePending ? (
                  <button
                    className="pending-input-card__steer"
                    type="button"
                    onClick={() => onPromotePending(item.id)}
                  >
                    <CornerDownLeft size={15} aria-hidden="true" />
                    调整方向
                  </button>
                ) : null}
                {onCancelPending ? (
                  <button
                    className="pending-input-card__icon"
                    type="button"
                    aria-label="删除后续消息"
                    title="删除后续消息"
                    onClick={() => onCancelPending(item.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  className="pending-input-card__icon"
                  type="button"
                  aria-label="更多后续消息操作"
                  title="更多操作"
                  disabled
                >
                  <Ellipsis size={16} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

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
  onClarificationRespond,
  onApprovalSubmit,
  pendingInputs = [],
  onPromotePending,
  onCancelPending,
  onSendPending,
  onReconnect,
  reasoningEffort = 'high',
  models = [],
  selectedModel = '',
  onModelChange = () => undefined,
  onReasoningEffortChange = () => undefined,
  attachment,
  attachmentUploading = false,
  onAttachmentSelected,
  onAttachmentRemove,
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
  onClarificationRespond?: (interruptId: string, answer: string) => void;
  onApprovalSubmit?: (interruptId: string, decisions: ToolApprovalDecision[]) => void;
  pendingInputs?: PendingUserInputView[];
  onPromotePending?: (inputId: string) => void;
  onCancelPending?: (inputId: string) => void;
  onSendPending?: (inputId: string) => void;
  onReconnect?: () => void;
  reasoningEffort?: ReasoningEffort;
  models?: PublicModelConfig[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  onReasoningEffortChange?: (value: ReasoningEffort) => void;
  attachment?: FileRef | null;
  attachmentUploading?: boolean;
  onAttachmentSelected?: (file: File) => void;
  onAttachmentRemove?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const renderedConversation = expandConversation(state.conversation);
  const latestAssistantId = [...renderedConversation]
    .reverse()
    .find((item) => item.kind === 'assistant')?.id;
  // 短会话保留普通 DOM，避免为少量消息引入虚拟化开销；长会话才启用窗口化渲染。
  const shouldVirtualize = renderedConversation.length > 40;
  // TanStack Virtual 返回带内部状态的方法，不能交给 React Compiler 自动记忆。
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: renderedConversation.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    getItemKey: (index) => renderedConversation[index]?.id ?? index,
    overscan: 6,
    paddingStart: 34,
    paddingEnd: 22,
    // JSDOM 没有真实布局尺寸；浏览器挂载后会由测量结果替换这个初始视口。
    initialRect: { width: 0, height: 800 },
    onChange: (instance, sync) => {
      if (sync || !shouldVirtualize || !stickToBottomRef.current) return;
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        if (stickToBottomRef.current && renderedConversation.length)
          instance.scrollToIndex(renderedConversation.length - 1, { align: 'end' });
      });
    },
  });
  function handleComposerSubmit(event: FormEvent<HTMLFormElement>): void {
    stickToBottomRef.current = true;
    onSubmit(event);
  }
  function handleConversationScroll(): void {
    const node = scrollRef.current;
    if (!node) return;
    stickToBottomRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight <
      AGENT_UI_BEHAVIOR.stickToBottomThresholdPx;
  }
  // 在浏览器绘制前同步到底部，避免新 token 先以旧 scrollTop 绘制一帧后再跳动。
  useLayoutEffect(() => {
    if (!stickToBottomRef.current || !scrollRef.current) return;
    const node = scrollRef.current;
    const scrollToBottom = () => {
      if (shouldVirtualize && renderedConversation.length)
        virtualizer.scrollToIndex(renderedConversation.length - 1, { align: 'end' });
      else node.scrollTop = node.scrollHeight;
    };
    scrollToBottom();
    // 虚拟行的 ResizeObserver 会在布局后更新总高度；下一帧再对齐一次新底部。
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (stickToBottomRef.current) scrollToBottom();
    });
    return () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    };
  }, [shouldVirtualize, state.conversation, virtualizer]);

  return (
    <section
      className="conversation flex min-h-0 min-w-0 flex-1 flex-col bg-surface text-text-primary"
      aria-label="对话"
    >
      <div
        className="conversation-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        ref={scrollRef}
        onScroll={handleConversationScroll}
        onMouseEnter={(event) => event.currentTarget.classList.add('is-scroll-active')}
        onMouseLeave={(event) => event.currentTarget.classList.remove('is-scroll-active')}
      >
        {renderedConversation.length === 0 ? (
          <div className="conversation-empty flex min-h-[500px] flex-col items-center justify-center gap-3 text-text-muted">
            <div className="empty-icon grid h-[50px] w-[50px] place-items-center rounded-xl border border-border bg-surface-subtle text-text-secondary">
              <Sparkles size={22} />
            </div>
            <h1 className="m-0 text-[19px] font-semibold text-text-primary">
              今天想完成什么任务？
            </h1>
          </div>
        ) : (
          <div
            className={`message-list mx-auto w-[min(820px,calc(100%-72px))] max-[1180px]:w-[min(760px,calc(100%-48px))] max-[900px]:w-[min(720px,calc(100%-36px))] max-[720px]:w-[calc(100%-24px)] ${shouldVirtualize ? '' : 'message-list--static'}`}
            style={shouldVirtualize ? { height: virtualizer.getTotalSize() } : undefined}
          >
            {shouldVirtualize
              ? virtualizer.getVirtualItems().map((virtualRow) => {
                  const item = renderedConversation[virtualRow.index];
                  if (!item) return null;
                  return (
                    <div
                      className="message-list__row"
                      data-index={virtualRow.index}
                      key={virtualRow.key}
                      ref={virtualizer.measureElement}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {item.kind === 'user' ? (
                        <UserMessage item={item} />
                      ) : (
                        <AssistantMessage
                          item={item}
                          showThinking={
                            Boolean(item.pending) || (submitting && item.id === latestAssistantId)
                          }
                          isAnimating={submitting && item.id === latestAssistantId}
                          onFocusWorkbench={onFocusWorkbench}
                        />
                      )}
                    </div>
                  );
                })
              : renderedConversation.map((item) => (
                  <div className="message-list__row message-list__row--static" key={item.id}>
                    {item.kind === 'user' ? (
                      <UserMessage item={item} />
                    ) : (
                      <AssistantMessage
                        item={item}
                        showThinking={
                          Boolean(item.pending) || (submitting && item.id === latestAssistantId)
                        }
                        isAnimating={submitting && item.id === latestAssistantId}
                        onFocusWorkbench={onFocusWorkbench}
                      />
                    )}
                  </div>
                ))}
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
        <div className={`composer-wrap ${submitting ? 'is-running' : ''}`}>
          <PlanFloatingCard
            plan={state.workbench?.plan}
            visible={
              submitting &&
              ['running', 'queued', 'cancel_requested'].includes(
                state.workbench?.activityStatus ?? 'running',
              )
            }
          />
          <FollowUpQueue
            state={state}
            pendingInputs={pendingInputs}
            submitting={submitting}
            onPromotePending={onPromotePending}
            onCancelPending={onCancelPending}
            onSendPending={onSendPending}
          />
          <Composer
            prompt={prompt}
            submitting={submitting}
            serviceState={serviceState}
            mode={composerMode}
            onPromptChange={onPromptChange}
            onSubmit={handleComposerSubmit}
            onCancel={onCancel}
            activeInterrupt={state.activeInterrupt ?? state.workbench?.activeInterrupt}
            onClarificationRespond={onClarificationRespond}
            onApprovalSubmit={onApprovalSubmit}
            controlState={state.workbench?.activityStatus}
            reasoningEffort={reasoningEffort}
            models={models}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            onReasoningEffortChange={onReasoningEffortChange}
            attachment={attachment}
            attachmentUploading={attachmentUploading}
            onAttachmentSelected={onAttachmentSelected}
            onAttachmentRemove={onAttachmentRemove}
          />
        </div>
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
function PlanFloatingCard({ plan, visible }: { plan?: PlanSnapshot; visible: boolean }) {
  // 浮标只在运行中且计划未清空、未全部完成时显示。
  if (!visible || !plan?.plan.length || plan.plan.every((step) => step.status === 'completed'))
    return null;
  // 没有 in_progress 时回退到第一步，保证入口仍显示稳定的 N / M。
  const activeIndex = Math.max(
    0,
    plan.plan.findIndex((step) => step.status === 'in_progress'),
  );
  return (
    <div
      className="plan-floating"
      role="status"
      aria-label={`执行计划，第 ${activeIndex + 1} / ${plan.plan.length} 步`}
    >
      <div className="plan-floating__trigger" tabIndex={0}>
        <span className="plan-floating__indicator" aria-hidden="true">
          <LoaderCircle size={14} />
        </span>
        <span>
          第 {activeIndex + 1} / {plan.plan.length} 步
        </span>
      </div>
      <div className="plan-floating__details">
        {plan.explanation ? <p className="plan-floating__explanation">{plan.explanation}</p> : null}
        <ol>
          {plan.plan.map((step, index) => (
            <li
              key={`${index}-${step.step}`}
              className={`plan-floating__step plan-floating__step--${step.status}`}
            >
              <span className="plan-floating__step-icon" aria-hidden="true">
                {step.status === 'completed' ? (
                  <Check size={14} />
                ) : step.status === 'in_progress' ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <span />
                )}
              </span>
              <span>{step.step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function Composer({
  prompt,
  submitting,
  serviceState,
  mode,
  onPromptChange,
  onSubmit,
  onCancel,
  activeInterrupt,
  onClarificationRespond,
  onApprovalSubmit,
  controlState,
  reasoningEffort = 'high',
  models = [],
  selectedModel = '',
  onModelChange = () => undefined,
  onReasoningEffortChange = () => undefined,
  attachment,
  attachmentUploading = false,
  onAttachmentSelected,
  onAttachmentRemove,
}: {
  prompt: string;
  submitting: boolean;
  serviceState: ServiceState;
  mode: 'new-run' | 'steer' | 'clarification' | 'disabled';
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  activeInterrupt?: InterruptSnapshot;
  onClarificationRespond?: (interruptId: string, answer: string) => void;
  onApprovalSubmit?: (interruptId: string, decisions: ToolApprovalDecision[]) => void;
  controlState?: WorkbenchState['activityStatus'];
  reasoningEffort?: ReasoningEffort;
  models?: PublicModelConfig[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  onReasoningEffortChange?: (value: ReasoningEffort) => void;
  attachment?: FileRef | null;
  attachmentUploading?: boolean;
  onAttachmentSelected?: (file: File) => void;
  onAttachmentRemove?: () => void;
}) {
  const composingRef = useRef(false);
  const [interruptState, setInterruptState] = useState<{
    interruptId?: string;
    answer: string;
    decisions: Record<string, 'approve' | 'reject'>;
    submitting: boolean;
  }>({ answer: '', decisions: {}, submitting: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);
  const currentInterruptState =
    interruptState.interruptId === activeInterrupt?.interruptId
      ? interruptState
      : { answer: '', decisions: {} as Record<string, 'approve' | 'reject'>, submitting: false };
  const updateInterruptState = (update: Partial<typeof currentInterruptState>) => {
    setInterruptState({
      interruptId: activeInterrupt?.interruptId,
      answer: currentInterruptState.answer,
      decisions: currentInterruptState.decisions,
      submitting: currentInterruptState.submitting,
      ...update,
    });
  };
  const attachmentModelUnsupported = Boolean(
    attachment &&
      selectedModel &&
      !models.find((model) => model.id === selectedModel)?.supportsVision,
  );
  useEffect(() => {
    if (!attachmentMenuOpen) return undefined;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) setAttachmentMenuOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [attachmentMenuOpen]);
  const placeholder =
    mode === 'steer'
      ? AGENT_UI_COPY.composerPlaceholders.steer
      : mode === 'clarification'
        ? AGENT_UI_COPY.composerPlaceholders.clarification
        : mode === 'disabled'
          ? AGENT_UI_COPY.composerPlaceholders.disabled
          : AGENT_UI_COPY.composerPlaceholders.newRun;
  return (
    <form
      className="composer rounded-[14px] border border-[var(--theme-composer-border)] bg-surface shadow-[0_8px_24px_rgb(0_0_0_/_3%)]"
      onSubmit={onSubmit}
    >
      {activeInterrupt?.kind === 'clarification' ? (
        <div className="composer-hitl-panel" role="group" aria-label="需要补充信息">
          <div className="composer-hitl-header">
            <strong>需要补充信息</strong>
            <button
              className="composer-hitl-cancel"
              type="button"
              aria-label="取消当前任务"
              title="取消当前任务"
              disabled={currentInterruptState.submitting || !onCancel}
              onClick={onCancel}
            >
              <X size={16} />
            </button>
          </div>
          <p className="composer-hitl-question">{activeInterrupt.payload.question}</p>
          {activeInterrupt.payload.options.map((option) => (
            <button
              key={option}
              type="button"
              className={
                currentInterruptState.answer === option
                  ? 'text-button composer-hitl-option is-active'
                  : 'text-button composer-hitl-option'
              }
              disabled={currentInterruptState.submitting}
              onClick={() => updateInterruptState({ answer: option })}
            >
              {option}
            </button>
          ))}
          {activeInterrupt.payload.allowFreeText ? (
            <input
              aria-label="澄清回答"
              value={currentInterruptState.answer}
              disabled={currentInterruptState.submitting}
              onChange={(event) => updateInterruptState({ answer: event.target.value })}
            />
          ) : null}
          <button
            className="send-button"
            type="button"
            disabled={
              !currentInterruptState.answer.trim() ||
              !onClarificationRespond ||
              currentInterruptState.submitting
            }
            onClick={() => {
              updateInterruptState({ submitting: true });
              onClarificationRespond?.(activeInterrupt.interruptId, currentInterruptState.answer);
            }}
          >
            {currentInterruptState.submitting ? <LoaderCircle className="spin" size={14} /> : null}
            {currentInterruptState.submitting ? '正在提交回答' : '提交回答'}
          </button>
        </div>
      ) : null}
      {activeInterrupt?.kind === 'tool_approval' ? (
        <div
          className="composer-hitl-panel composer-approval-overlay"
          role="group"
          aria-label="工具审批"
        >
          <div className="composer-hitl-header">
            <strong>需要批准工具调用</strong>
            <button
              className="composer-hitl-cancel"
              type="button"
              aria-label="取消当前任务"
              title="取消当前任务"
              disabled={currentInterruptState.submitting || !onCancel}
              onClick={onCancel}
            >
              <X size={16} />
            </button>
          </div>
          {activeInterrupt.payload.items.slice(0, 1).map((item) => (
            <div className="approval-item" key={item.itemId}>
              <div className="approval-item__summary">
                <strong>{item.toolName}</strong>
              </div>
              <div className="approval-item__actions">
                {(['reject', 'approve'] as const).map((decision) => (
                  <button
                    key={decision}
                    type="button"
                    className={
                      decision === 'approve'
                        ? 'send-button approval-item__approve'
                        : 'secondary-button approval-item__reject'
                    }
                    disabled={currentInterruptState.submitting || !onApprovalSubmit}
                    onClick={() => {
                      updateInterruptState({ submitting: true });
                      onApprovalSubmit?.(activeInterrupt.interruptId, [
                        {
                          itemId: item.itemId,
                          toolCallId: item.toolCallId,
                          argumentsHash: item.argumentsHash,
                          decision,
                        },
                      ]);
                    }}
                  >
                    {currentInterruptState.submitting ? (
                      <LoaderCircle className="spin" size={13} />
                    ) : null}
                    {decision === 'approve' ? '批准' : '拒绝'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {activeInterrupt?.kind !== 'clarification' ? (
        <div className="composer-attachments px-[15px] pt-3">
          {attachment ? (
            <div className="composer-attachment-preview">
              {attachment.previewUrl ? (
                <button
                  type="button"
                  className="composer-attachment-preview__open"
                  aria-label={`预览${attachment.fileName}`}
                  onClick={() => setAttachmentPreviewOpen(true)}
                >
                  <img src={attachment.previewUrl} alt={attachment.fileName} />
                  {attachment.status === 'processing' ? (
                    <span className="composer-attachment-preview__processing" aria-label="图片上传中">
                      <LoaderCircle className="spin" size={18} />
                    </span>
                  ) : null}
                </button>
              ) : (
                <div className="composer-attachment-preview__loading">
                  <LoaderCircle className="spin" size={16} />
                </div>
              )}
              <button
                className="composer-attachment-preview__remove"
                type="button"
                aria-label="移除图片"
                title="移除图片"
                onClick={onAttachmentRemove}
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
          {attachmentModelUnsupported ? (
            <div className="composer-hints">当前模型不支持图片，请切换到 DeepSeek Vision。</div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onAttachmentSelected?.(file);
            }}
          />
        </div>
      ) : null}
      {attachmentPreviewOpen && attachment?.previewUrl ? (
        <ImageLightbox
          src={attachment.previewUrl}
          alt={attachment.fileName}
          onClose={() => setAttachmentPreviewOpen(false)}
        />
      ) : null}
      {activeInterrupt?.kind !== 'clarification' ? (
        <textarea
          aria-label="任务输入"
          placeholder={placeholder}
          rows={3}
          value={prompt}
          disabled={
            mode === 'disabled' || controlState === 'waiting_for_user' || Boolean(activeInterrupt)
          }
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
              // 新任务需要等待当前提交完成；运行中的 steer/follow-up 则允许直接入队。
              if (prompt.trim() && mode !== 'disabled') {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }
          }}
        />
      ) : null}
      {activeInterrupt?.kind !== 'clarification' ? (
        <div className="composer-actions flex min-h-12 items-center justify-between px-[15px] py-[5px] pr-2 text-xs text-text-muted">
          {mode === 'clarification' ? (
            <div className="composer-hints">
              <SlidersHorizontal size={14} />
              <span>回答后继续当前任务</span>
            </div>
          ) : mode === 'new-run' ? (
            <div className="composer-add-wrap" ref={addMenuRef}>
              <div
                className={`composer-add-menu${attachmentMenuOpen ? ' is-open' : ''}`}
                role="menu"
                aria-hidden={!attachmentMenuOpen}
              >
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={attachmentMenuOpen ? 0 : -1}
                    disabled={attachmentUploading || submitting || serviceState !== 'ready'}
                    onClick={() => {
                      setAttachmentMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Paperclip className="composer-add-menu__icon" size={16} aria-hidden="true" />
                    <span>文件和图片</span>
                  </button>
              </div>
              <button
                type="button"
                className="composer-add-button"
                aria-label="添加文件和图片"
                aria-expanded={attachmentMenuOpen}
                title="添加文件和图片"
                disabled={attachmentUploading || submitting || serviceState !== 'ready'}
                onClick={() => setAttachmentMenuOpen((open) => !open)}
              >
                <Plus size={18} />
              </button>
            </div>
          ) : (
            <span />
          )}
          <div className="composer-submit-group">
            {mode !== 'steer' && mode !== 'clarification' ? (
              <ModelSettingsMenu
                modelId={selectedModel}
                models={models}
                reasoningEffort={reasoningEffort}
                disabled={submitting || mode === 'disabled'}
                onModelChange={onModelChange}
                onReasoningEffortChange={onReasoningEffortChange}
              />
            ) : null}
            <button
              className={`send-button composer-send-button${submitting && prompt.trim() ? ' is-ready' : ''}${submitting && !prompt.trim() ? ' is-stop' : ''}`}
              type={submitting && !prompt.trim() ? 'button' : 'submit'}
              aria-label={
                submitting && !prompt.trim()
                  ? '停止任务'
                  : mode === 'steer'
                    ? '提交后续消息'
                    : '发送任务'
              }
              title={
                submitting && !prompt.trim()
                  ? '停止任务'
                  : mode === 'steer'
                    ? '提交后续消息'
                    : '发送任务'
              }
              disabled={
                submitting && !prompt.trim()
                  ? !onCancel
                  : !prompt.trim() ||
                    serviceState !== 'ready' ||
                    mode === 'disabled' ||
                    attachmentUploading ||
                    attachmentModelUnsupported ||
                    Boolean(attachment && attachment.status !== 'ready')
              }
              onClick={submitting && !prompt.trim() ? onCancel : undefined}
            >
              {submitting && !prompt.trim() ? (
                <Square size={14} fill="currentColor" />
              ) : (
                <ArrowUp size={18} strokeWidth={2.25} />
              )}
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

const reasoningLabels: Record<ReasoningEffort, string> = {
  off: '无思考',
  low: '轻度',
  high: '中度',
  max: '高度',
};
const compactReasoningLabels: Record<ReasoningEffort, string> = {
  off: '无',
  low: '轻',
  high: '中',
  max: '高',
};

function ModelSettingsMenu({
  modelId,
  models,
  reasoningEffort,
  disabled,
  onModelChange,
  onReasoningEffortChange,
}: {
  modelId: string;
  models: PublicModelConfig[];
  reasoningEffort: ReasoningEffort;
  disabled: boolean;
  onModelChange: (model: string) => void;
  onReasoningEffortChange: (value: ReasoningEffort) => void;
}) {
  const selected = models.find((model) => model.id === modelId) ?? models[0];
  if (!selected) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="model-settings-trigger" type="button" disabled={disabled}>
          {selected.label} {compactReasoningLabels[reasoningEffort]}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="model-settings-menu" side="top" align="end">
        <DropdownMenuLabel>模型</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selected.id} onValueChange={onModelChange}>
          {models.map((model) => (
            <DropdownMenuRadioItem key={model.id} value={model.id}>
              {model.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>推理强度</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={reasoningEffort}
          onValueChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}
        >
          {selected.reasoning.levels.map((level) => (
            <DropdownMenuRadioItem key={level} value={level}>
              {reasoningLabels[level]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
