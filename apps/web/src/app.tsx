import { Ellipsis, Menu, Moon, Pencil, Pin, PinOff, Plus, Sun, Trash2, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';

import {
  ApiProblem,
  cancelRun,
  controlRun,
  createRun,
  createSession,
  deleteSession,
  getRun,
  getReadiness,
  getPublicAgentConfig,
  getSession,
  listSessions,
  subscribeRun,
  updateSession,
} from './api/client';
import type { MessageDeltaEvent, ModelRoundCompletedEvent, ToolStreamEvent } from './api/client';
import {
  AGENT_PROTOCOL_LIMITS,
  assistantAgentMetadataSchema,
  normalizeSourceUrl,
} from '@harness/agent-protocol';
import type {
  AssistantContentBlock,
  PersistedMessage,
  RunSnapshot,
  RunStreamEvent,
  SessionSummary,
  SourceProvenance,
  ReasoningEffort,
  PublicModelConfig,
  ToolApprovalDecision,
} from '@harness/agent-protocol';
import type {
  AgentUiState,
  ConversationItem,
  PreviewState,
  ServiceState,
  SourceView,
  ToolCallView,
  WorkbenchFocusTarget,
  WorkbenchState,
  WorkspaceView,
} from './features/agent/model/types';
import {
  appendTextDelta,
  applyToolActivityEvent,
  cloneAssistantBlocks,
} from './features/agent/model/conversation-blocks';
import { nextSourceNumber } from './features/agent/model/source-identifiers';
import { WorkbenchShell } from './features/agent/components/workbench-views';
import { Conversation } from './features/agent/components/conversation';
import { PREVIEW_STATES, makeFixture } from './features/agent/fixtures/preview';
import { AGENT_UI_COPY, SERVICE_STATE_LABELS } from './features/agent/config/ui.constants';
import { useTheme, type Theme } from './theme';
import {
  Dialog,
  DialogAction,
  DialogCancel,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';

// 将传输和供应商异常转换为用户可读的提示文案。
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiProblem) return error.problem.detail;
  if (error instanceof Error && error.name === 'ZodError')
    return '工具返回的数据格式异常，本次回答未完成，请稍后重试。';
  if (error instanceof Error) return error.message;
  return '请求暂时无法完成。';
}

// 仅在开发环境的预览路由中启用 fixture。
function getPreviewState(): PreviewState | null {
  if (!import.meta.env.DEV || window.location.pathname !== '/agent/preview') return null;
  const value = new URLSearchParams(window.location.search).get('state') as PreviewState | null;
  return value && PREVIEW_STATES.some((item) => item.id === value) ? value : 'empty';
}

// 根据当前地址选择生产状态或开发预览状态。
export function App() {
  const [theme, toggleTheme] = useTheme();
  const preview = getPreviewState();
  return (
    <>
      {preview ? (
        <AppShell
          key={preview}
          previewState={makeFixture(preview)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <PersistentAgentApp theme={theme} onToggleTheme={toggleTheme} />
      )}
      {preview ? <PreviewSwitcher active={preview} /> : null}
    </>
  );
}

// 将工具耗时格式化为适合 Workbench 展示的短文本。
function formatToolDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs} 毫秒` : `${(durationMs / 1000).toFixed(1)} 秒`;
}

// 从任意网页地址读取适合 Workbench 展示的域名。
function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// 安全规范化来源 URL，损坏地址保留原值以避免实时投影中断。
function canonicalUrl(url: string): string {
  try {
    return normalizeSourceUrl(url);
  } catch {
    return url;
  }
}

// 返回来源可参与实时 canonical merge 的全部 URL。
function sourceViewUrls(source: SourceView): string[] {
  return [source.url, source.requestedUrl, source.normalizedUrl].filter((url): url is string =>
    Boolean(url),
  );
}

// 按固定优先级合并来源 provenance。
function preferredProvenance(
  left: SourceProvenance | undefined,
  right: SourceProvenance,
): SourceProvenance {
  const priority = { user_provided: 3, search_clue: 2, model_proposed: 1, unknown: 0 };
  return left && priority[left] >= priority[right] ? left : right;
}

// 将持久化 assistant metadata 投影为可恢复的轻量 Workbench。
// eslint-disable-next-line react-refresh/only-export-components -- 导出纯投影函数供实时/恢复一致性单测复用。
export function workbenchFromPersistedMessage(
  message: PersistedMessage,
): WorkbenchState | undefined {
  if (message.role !== 'assistant') return undefined;
  const metadata = assistantAgentMetadataSchema.safeParse(message.metadata);
  if (!metadata.success) return undefined;
  const executions = metadata.data.agent?.executions ?? [];
  const sources = metadata.data.agent?.sources ?? [];
  const context = metadata.data.context;
  if (!executions.length && !context) return undefined;
  const completedCount = executions.filter((execution) => execution.status === 'completed').length;
  const cancelledCount = executions.filter((execution) => execution.status === 'cancelled').length;
  let clueIndex = 0;
  let candidateIndex = 0;
  const sourceViews = sources.map((source) => {
    if (source.kind === 'fetched') {
      candidateIndex += 1;
      return {
        id: `F${candidateIndex}`,
        title: source.title,
        domain: sourceDomain(source.finalUrl),
        url: source.finalUrl,
        excerpt: source.passages[0]?.text ?? '已读取网页，但没有匹配当前问题的原文片段。',
        time: new Date(source.retrievedAt).toLocaleString('zh-CN'),
        kind: 'fetched' as const,
        used: source.used,
        author: source.author,
        publishedAt: source.publishedAt,
        contentType: source.contentType,
        cacheStatus: source.cacheStatus,
        truncated: source.truncated,
        passages: source.passages,
        provenance: source.provenance,
        requestedUrl: source.requestedUrl,
        normalizedUrl: source.normalizedUrl,
        contentHash: source.contentHash,
        toolCallIds: source.toolCallIds,
      };
    }
    clueIndex += 1;
    return {
      id: `R${clueIndex}`,
      title: source.title,
      domain: source.domain,
      url: source.url,
      excerpt: source.snippet,
      time: new Date(source.retrievedAt).toLocaleString('zh-CN'),
      provider: source.provider,
      kind: 'clue' as const,
      used: source.used,
      provenance: source.provenance,
      toolCallIds: source.toolCallIds,
    };
  });
  return {
    runId: message.runId ?? message.id,
    title: context && !executions.length ? 'Context 调试' : AGENT_UI_COPY.searchWorkbenchTitle,
    subtitle:
      context && !executions.length
        ? `Model Round ${context.roundSequence}`
        : `${executions.length} 次调用 · ${sourceViews.length} 个来源`,
    activeView: sources.length ? 'sources' : context && !executions.length ? 'context' : 'activity',
    activityStatus: completedCount
      ? 'completed'
      : cancelledCount === executions.length
        ? 'cancelled'
        : 'failed',
    executions: executions.map((execution) => {
      const isFetch = execution.toolName === 'web_fetch';
      const isApprovalTest = execution.toolName === 'approval_test';
      const isCurrentTime = execution.toolName === 'get_current_time';
      const inputSummary = isFetch
        ? `${execution.input.urls.length} 个网页${execution.input.query ? ` · ${execution.input.query}` : ''}`
        : isApprovalTest
          ? execution.input.message
          : isCurrentTime
            ? '获取当前日期和时间'
            : execution.input.query;
      return {
        toolCallId: execution.toolCallId,
        runId: message.runId ?? message.id,
        stepId: execution.toolCallId,
        toolName: execution.toolName,
        title: isFetch
          ? `读取 ${execution.input.urls.length} 个网页`
          : isApprovalTest
            ? '运行审批测试'
            : isCurrentTime
              ? '获取当前日期和时间'
            : `搜索：${execution.input.query}`,
        detail:
          execution.status === 'completed'
            ? isFetch
              ? '网页原文读取已完成'
              : isApprovalTest
                ? '审批测试已完成'
                : '公开网页检索已完成'
            : execution.status === 'cancelled'
              ? '工具调用已取消'
              : '工具调用未完成',
        status: execution.status,
        elapsed: formatToolDuration(execution.durationMs),
        inputSummary,
        outputSummary:
          execution.status === 'completed'
            ? isFetch
              ? `成功 ${execution.succeededCount ?? 0} 个，失败 ${execution.failedCount ?? 0} 个，提取 ${execution.passageCount ?? 0} 段原文`
              : `返回 ${execution.resultCount ?? 0} 条网页结果`
            : execution.error?.detail,
        resultCount: execution.resultCount,
        sourceCount: isFetch ? execution.succeededCount : execution.resultCount,
      };
    }),
    followMode: 'auto',
    sources: sourceViews,
    ...(context ? { context } : {}),
    open: Boolean(context && !executions.length),
  };
}

// 将实时工具生命周期事件增量投影到当前 Workbench 状态。
// eslint-disable-next-line react-refresh/only-export-components -- 导出纯投影函数供实时/恢复一致性单测复用。
export function applyToolEvent(
  current: WorkbenchState | undefined,
  event: ToolStreamEvent,
  open: boolean,
  currentUserUrls: ReadonlySet<string> = new Set(),
): WorkbenchState {
  const base: WorkbenchState = current ?? {
    runId: event.messageId,
    title: AGENT_UI_COPY.searchWorkbenchTitle,
    subtitle: '正在搜索公开网页',
    activeView: 'activity',
    activityStatus: 'running',
    executions: [],
    followMode: 'auto',
    sources: [],
    open,
  };
  if (event.type === 'tool.started') {
    const isFetch = event.toolName === 'web_fetch';
    const isApprovalTest = event.toolName === 'approval_test';
    const isCurrentTime = event.toolName === 'get_current_time';
    const inputSummary = isFetch
      ? `${event.input.urls.length} 个网页${event.input.query ? ` · ${event.input.query}` : ''}`
      : isApprovalTest
        ? event.input.message
        : isCurrentTime
          ? '获取当前日期和时间'
          : event.input.query;
    const tool: ToolCallView = {
      toolCallId: event.toolCallId,
      runId: event.messageId,
      stepId: event.toolCallId,
      toolName: event.toolName,
      title: isFetch
        ? `读取 ${event.input.urls.length} 个网页`
        : isApprovalTest
          ? '运行审批测试'
          : isCurrentTime
            ? '获取当前日期和时间'
          : `搜索：${event.input.query}`,
      detail: isFetch
        ? '正在读取和过滤网页正文'
        : isApprovalTest
          ? '正在执行已批准的无副作用工具'
          : isCurrentTime
            ? '正在获取当前日期和时间'
          : '正在搜索公开网页',
      status: 'running',
      elapsed: '进行中',
      inputSummary,
    };
    const executions = base.executions.some((item) => item.toolCallId === event.toolCallId)
      ? base.executions
      : [...base.executions, tool];
    return {
      ...base,
      open,
      activityStatus: 'running',
      executions,
      focusTarget: {
        kind: 'tool_call',
        runId: event.messageId,
        stepId: event.toolCallId,
        toolCallId: event.toolCallId,
      },
    };
  }

  const completedEvent = event.type === 'tool.completed' ? event : undefined;
  const failedEvent = event.type === 'tool.failed' ? event : undefined;
  const cancelledEvent = event.type === 'tool.cancelled' ? event : undefined;
  const status = completedEvent
    ? ('completed' as const)
    : cancelledEvent
      ? ('cancelled' as const)
      : ('failed' as const);
  const completedFetch = completedEvent?.toolName === 'web_fetch' ? completedEvent : undefined;
  const completedApproval =
    completedEvent?.toolName === 'approval_test' ? completedEvent : undefined;
  const completedCurrentTime =
    completedEvent?.toolName === 'get_current_time' ? completedEvent : undefined;
  const fetchSucceeded =
    completedFetch?.result.results.filter((item) => item.status === 'succeeded') ?? [];
  const executions = base.executions.map((tool) =>
    tool.toolCallId === event.toolCallId
      ? {
          ...tool,
          status,
          detail: completedEvent
            ? completedFetch
              ? '网页原文读取已完成'
              : completedApproval
                ? '审批测试已完成'
                : completedCurrentTime
                  ? '当前时间已获取'
                : '公开网页检索已完成'
            : (cancelledEvent?.detail ?? failedEvent?.detail ?? '工具执行失败'),
          elapsed: formatToolDuration(event.durationMs),
          outputSummary: completedEvent
            ? completedFetch
              ? `成功 ${completedFetch.result.stats.succeededCount} 个，失败 ${completedFetch.result.stats.failedCount} 个，跳过 ${completedFetch.result.stats.skippedCount} 个，网络请求 ${completedFetch.result.stats.networkAttemptCount} 次，提取 ${completedFetch.result.stats.passageCount} 段原文`
              : completedApproval
                ? `返回：${completedApproval.result.echoed}`
                : completedCurrentTime
                  ? '已返回当前时间'
                  : `返回 ${completedEvent?.toolName === 'web_search' ? completedEvent.result.results.length : 0} 条网页结果`
            : (cancelledEvent?.detail ?? failedEvent?.detail),
          resultCount:
            completedEvent && (completedEvent.toolName === 'web_search' || completedEvent.toolName === 'web_fetch')
              ? completedEvent.result.results.length
              : undefined,
          sourceCount: completedFetch
            ? fetchSucceeded.length
            : completedEvent && (completedEvent.toolName === 'web_search' || completedEvent.toolName === 'web_fetch')
              ? completedEvent.result.results.length
              : undefined,
        }
      : tool,
  );
  const sources = [...base.sources];
  if (event.type === 'tool.completed' && event.toolName === 'web_search') {
    let clueNumber = nextSourceNumber(base.sources, 'R');
    for (const source of event.result.results) {
      const sourceKey = canonicalUrl(source.url);
      const existing = sources.find((item) =>
        sourceViewUrls(item).some((url) => canonicalUrl(url) === sourceKey),
      );
      if (existing) {
        existing.toolCallIds = [...new Set([...(existing.toolCallIds ?? []), event.toolCallId])];
        if (existing.kind === 'clue')
          existing.provenance = preferredProvenance(existing.provenance, 'search_clue');
      } else {
        sources.push({
          id: `R${clueNumber}`,
          title: source.title,
          domain: source.domain,
          url: source.url,
          excerpt: source.snippet,
          time: new Date(event.completedAt).toLocaleString('zh-CN'),
          provider: event.result.provider,
          kind: 'clue',
          provenance: 'search_clue',
          toolCallIds: [event.toolCallId],
        });
        clueNumber += 1;
      }
    }
  }
  if (event.type === 'tool.completed' && event.toolName === 'web_fetch') {
    let candidateNumber = nextSourceNumber(base.sources, 'F');
    for (const source of event.result.results) {
      if (source.status !== 'succeeded' || !source.passages.length) continue;
      const resultUrls = new Set(
        [source.requestedUrl, source.finalUrl, source.normalizedUrl].map(canonicalUrl),
      );
      const urlIndexes = sources.flatMap((item, index) =>
        sourceViewUrls(item).some((url) => resultUrls.has(canonicalUrl(url))) ? [index] : [],
      );
      const hashIndexes = sources.flatMap((item, index) =>
        item.contentHash === source.contentHash ? [index] : [],
      );
      const collisions = [...new Set([...urlIndexes, ...hashIndexes])].sort((a, b) => a - b);
      const requestedKey = canonicalUrl(source.requestedUrl);
      const provenance = currentUserUrls.has(requestedKey)
        ? 'user_provided'
        : urlIndexes.some((index) => sources[index]?.kind === 'clue')
          ? 'search_clue'
          : 'model_proposed';
      // 仅 hash 相同但 URL 不同的来源保留首次卡片，只聚合执行身份。
      if (!urlIndexes.length && hashIndexes.length) {
        const target = sources[hashIndexes[0]!];
        if (target) {
          target.toolCallIds = [
            ...new Set([
              ...(target.toolCallIds ?? []),
              ...hashIndexes.flatMap((index) => sources[index]?.toolCallIds ?? []),
              event.toolCallId,
            ]),
          ];
          target.provenance = hashIndexes.reduce(
            (value, index) => preferredProvenance(value, sources[index]?.provenance ?? 'unknown'),
            preferredProvenance(target.provenance, provenance),
          );
        }
        for (const index of hashIndexes.slice(1).reverse()) sources.splice(index, 1);
        continue;
      }
      const existing = collisions[0] === undefined ? undefined : sources[collisions[0]];
      const candidateId = existing?.kind === 'fetched' ? existing.id : `F${candidateNumber++}`;
      const mergedToolCallIds = [
        ...new Set([
          ...(existing?.toolCallIds ?? []),
          ...collisions.flatMap((index) => sources[index]?.toolCallIds ?? []),
          event.toolCallId,
        ]),
      ];
      const mergedProvenance = collisions.reduce(
        (value, index) => preferredProvenance(value, sources[index]?.provenance ?? 'unknown'),
        provenance as SourceProvenance,
      );
      const candidate: SourceView = {
        id: candidateId,
        title: source.title,
        domain: sourceDomain(source.finalUrl),
        url: source.finalUrl,
        excerpt: source.passages[0]?.text ?? '',
        time: new Date(source.retrievedAt).toLocaleString('zh-CN'),
        kind: 'fetched',
        used: false,
        author: source.author,
        publishedAt: source.publishedAt,
        contentType: source.contentType,
        cacheStatus: source.cacheStatus,
        truncated: source.truncated,
        passages: source.passages,
        provenance: mergedProvenance,
        requestedUrl: source.requestedUrl,
        normalizedUrl: source.normalizedUrl,
        contentHash: source.contentHash,
        toolCallIds: mergedToolCallIds,
      };
      if (collisions[0] === undefined) sources.push(candidate);
      else {
        sources[collisions[0]] = candidate;
        for (const index of collisions.slice(1).reverse()) sources.splice(index, 1);
      }
    }
  }
  return {
    ...base,
    open,
    activityStatus: cancelledEvent ? 'cancelled' : base.activityStatus,
    subtitle: `${executions.length} 次调用 · ${sources.length} 个来源`,
    activeView: event.type === 'tool.completed' && sources.length ? 'sources' : base.activeView,
    executions,
    sources,
  };
}

// 将持久化消息转换为 Conversation 可直接渲染的项目。
function toConversationItem(message: PersistedMessage): ConversationItem {
  if (message.role === 'user')
    return {
      id: message.id,
      kind: 'user',
      content: message.content,
      createdAt: message.createdAt,
    };
  const metadata = assistantAgentMetadataSchema.safeParse(message.metadata);
  const blocks: AssistantContentBlock[] =
    metadata.success && metadata.data.blocks?.length
      ? cloneAssistantBlocks(metadata.data.blocks)
      : [{ id: `${message.id}-text-1`, type: 'text', content: message.content }];
  return {
    id: message.id,
    kind: 'assistant',
    blocks,
    ...(message.deliveryStatus ? { deliveryStatus: message.deliveryStatus } : {}),
    createdAt: message.createdAt,
    workbench: workbenchFromPersistedMessage(message),
  };
}

// 从首条用户输入构造创建会话时使用的临时标题。
function makeProvisionalTitle(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength);
}

// 将当前会话选择同步到可刷新恢复的查询参数。
function updateSessionUrl(sessionId: string | null, replace = false): void {
  const url = sessionId ? `/agent?session=${encodeURIComponent(sessionId)}` : '/agent';
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
}

// 按置顶优先、最近更新其次的规则稳定排列会话。
function sortSessionSummaries(items: SessionSummary[]): SessionSummary[] {
  return [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      className="icon-button ml-auto border border-transparent text-text-secondary hover:border-border hover:bg-surface-hover"
      type="button"
      aria-label={theme === 'dark' ? '切换浅色主题' : '切换暗色主题'}
      title={theme === 'dark' ? '切换浅色主题' : '切换暗色主题'}
      onClick={onToggle}
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

// 管理生产页面的持久化会话、独立缓存和后台流。
function PersistentAgentApp({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  // 会话列表与 sessionStates 分离：前者驱动 Sidebar，后者缓存各会话独立 UI 投影。
  const [serviceState, setServiceState] = useState<ServiceState>('checking');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionStates, setSessionStatesState] = useState<Record<string, AgentUiState>>({});
  // pendingSessions 允许不同会话并行生成，同时限制同一会话重复提交。
  const [pendingSessions, setPendingSessions] = useState<Record<string, boolean>>({});
  const [draftPending, setDraftPending] = useState(false);
  const [draftState, setDraftState] = useState<AgentUiState>(() => makeFixture('empty'));
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null);
  const [reconnectRunId, setReconnectRunId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');
  const [models, setModels] = useState<PublicModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  // ref 为异步 SSE 回调提供最新值，避免闭包读取过期 React state。
  const selectedSessionIdRef = useRef<string | null>(null);
  const pendingSessionsRef = useRef<Record<string, boolean>>({});
  const runControllersRef = useRef<Record<string, AbortController>>({});
  const runSequencesRef = useRef<Record<string, number>>({});
  const sessionStatesRef = useRef<Record<string, AgentUiState>>({});
  // 草稿提交在创建持久化 Session 前可能跨越一次导航；递增 token 让旧请求失去“抢回”当前视图的资格。
  const draftSubmissionTokenRef = useRef(0);

  useEffect(() => {
    pendingSessionsRef.current = pendingSessions;
  }, [pendingSessions]);

  useEffect(() => {
    sessionStatesRef.current = sessionStates;
  }, [sessionStates]);

  useEffect(() => {
    const controller = new AbortController();
    void getPublicAgentConfig(controller.signal)
      .then((config) => {
        const selected =
          config.models.find((model) => model.id === config.defaultModel) ?? config.models[0];
        setModels(config.models);
        if (selected) {
          setSelectedModel(selected.id);
          setReasoningEffort(selected.reasoning.default);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  function setSessionStates(
    update: (current: Record<string, AgentUiState>) => Record<string, AgentUiState>,
  ): void {
    const next = update(sessionStatesRef.current);
    sessionStatesRef.current = next;
    setSessionStatesState(next);
  }

  // React state 决定渲染，Ref 为同一事件循环内的提交/SSE 回调提供即时值；必须同步写入，
  // 否则旧 render 的 Effect 可能在“新建后立即提交”时把请求错误路由到上一会话。
  function setSelectedSession(sessionId: string | null): void {
    selectedSessionIdRef.current = sessionId;
    setSelectedSessionId(sessionId);
  }

  // 同步更新 pending ref 和 React 状态，避免异步详情请求读到旧值。
  function setSessionPending(sessionId: string, pending: boolean): void {
    const next = { ...pendingSessionsRef.current, [sessionId]: pending };
    pendingSessionsRef.current = next;
    setPendingSessions(next);
  }

  function applyRunSnapshot(sessionId: string, snapshot: RunSnapshot): void {
    // Snapshot 是完整替换，但旧 HTTP/SSE 响应不能覆盖已经应用到更高 cursor 的 Live 状态。
    if (snapshot.lastEventSequence < (runSequencesRef.current[snapshot.runId] ?? 0)) return;
    runSequencesRef.current[snapshot.runId] = snapshot.lastEventSequence;
    const active = ['queued', 'running', 'cancel_requested'].includes(snapshot.status);
    const controlStatus = snapshot.control?.state;
    const activityStatus =
      controlStatus === 'paused' ||
      controlStatus === 'pause_requested' ||
      controlStatus === 'resuming' ||
      controlStatus === 'waiting_for_user'
        ? controlStatus
        : snapshot.status === 'cancelled'
          ? ('cancelled' as const)
          : snapshot.status === 'failed'
            ? ('failed' as const)
            : snapshot.status === 'completed'
              ? ('completed' as const)
              : ('running' as const);
    setSessionPending(sessionId, active);
    const restored = toConversationItem({
      id: snapshot.assistantMessageId,
      sessionId,
      role: 'assistant',
      kind: 'assistant_delivery',
      content: snapshot.assistantContent,
      runId: snapshot.runId,
      deliveryStatus:
        snapshot.status === 'completed'
          ? 'completed'
          : snapshot.status === 'cancelled'
            ? 'cancelled'
            : snapshot.status === 'failed'
              ? 'failed'
              : 'streaming',
      createdAt: snapshot.createdAt,
      metadata: {
        model: 'restored',
        deliveryStatus:
          snapshot.status === 'completed'
            ? 'completed'
            : snapshot.status === 'cancelled'
              ? 'cancelled'
              : snapshot.status === 'failed'
                ? 'failed'
                : 'streaming',
        runId: snapshot.runId,
        blocks: snapshot.blocks,
        agent: {
          toolCallCount: snapshot.toolCallCount,
          executions: snapshot.executions,
          sources: snapshot.sources,
        },
      },
    });
    if (restored.kind !== 'assistant') return;
    const workbench = restored.workbench
      ? {
          ...restored.workbench,
          runId: snapshot.runId,
          activityStatus,
          ...(snapshot.control?.phase ? { controlPhase: snapshot.control.phase } : {}),
          ...(snapshot.activeInterrupt
            ? { activeInterrupt: snapshot.activeInterrupt }
            : { activeInterrupt: undefined }),
          executions: restored.workbench.executions.map((item) => ({
            ...item,
            runId: snapshot.runId,
          })),
          ...(snapshot.context ? { context: snapshot.context } : {}),
        }
      : undefined;
    // 只替换目标 Run 对应的 Assistant Message；其他历史轮次和其他 Session 缓存保持不变。
    setSessionStates((current) => {
      const target = current[sessionId];
      if (!target) return current;
      const item = { ...restored, pending: active, ...(workbench ? { workbench } : {}) };
      const exists = target.conversation.some(
        (entry) => entry.kind === 'assistant' && entry.id === snapshot.assistantMessageId,
      );
      return {
        ...current,
        [sessionId]: {
          ...target,
          conversation: exists
            ? target.conversation.map((entry) =>
                entry.kind === 'assistant' && entry.id === snapshot.assistantMessageId
                  ? item
                  : entry,
              )
            : [...target.conversation, item],
          ...(workbench ? { workbench } : {}),
          ...(snapshot.context ? { context: snapshot.context } : {}),
          ...(snapshot.activeInterrupt
            ? { activeInterrupt: snapshot.activeInterrupt }
            : { activeInterrupt: undefined }),
          ...(active ? { activeRunId: snapshot.runId } : { activeRunId: undefined }),
        },
      };
    });
    if (snapshot.error && selectedSessionIdRef.current === sessionId)
      setError(snapshot.error.detail);
  }

  function applyRunEvent(sessionId: string, event: RunStreamEvent, task = ''): void {
    const cursor = runSequencesRef.current[event.runId] ?? 0;
    // 重放重复事件幂等忽略；非连续 Event 绝不能猜测应用，交给 observeRun 重新拉 Snapshot。
    if (event.seq <= cursor) return;
    if (event.type === 'run.snapshot') {
      applyRunSnapshot(sessionId, event.payload as RunSnapshot);
      return;
    }
    if (event.seq !== cursor + 1) throw new Error('RUN_EVENT_SEQUENCE_GAP');
    // 只有确认目标 Session/Message 存在且成功归约后，下面各分支才推进 cursor。
    const target = sessionStatesRef.current[sessionId];
    if (!target) throw new Error('RUN_EVENT_TARGET_MISSING');
    if (event.type === 'message.delta') {
      const delta = event.payload as MessageDeltaEvent;
      if (
        !target.conversation.some(
          (item) => item.kind === 'assistant' && item.id === delta.messageId,
        )
      )
        throw new Error('RUN_EVENT_TARGET_MISSING');
      setSessionStates((current) => {
        const target = current[sessionId];
        if (!target) return current;
        return {
          ...current,
          [sessionId]: {
            ...target,
            conversation: target.conversation.map((item) =>
              item.kind === 'assistant' && item.id === delta.messageId
                ? { ...item, blocks: appendTextDelta(item.blocks, delta) }
                : item,
            ),
          },
        };
      });
      runSequencesRef.current[event.runId] = event.seq;
      return;
    }
    if (event.type === 'reasoning.delta') {
      // 协议 0.10 兼容：旧 Event Tail 中的 reasoning 只推进 cursor，不再进入用户投影。
      runSequencesRef.current[event.runId] = event.seq;
      return;
    }
    if (event.type === 'model.round.completed') {
      const round = event.payload as ModelRoundCompletedEvent;
      setSessionStates((current) => {
        const target = current[sessionId];
        if (!target) return current;
        const workbench =
          target.workbench && round.context
            ? { ...target.workbench, context: round.context }
            : target.workbench;
        return {
          ...current,
          [sessionId]: {
            ...target,
            ...(round.context ? { context: round.context } : {}),
            workbench,
          },
        };
      });
      runSequencesRef.current[event.runId] = event.seq;
      return;
    }
    if (
      event.type === 'run.pause_requested' ||
      event.type === 'run.paused' ||
      event.type === 'run.resuming' ||
      event.type === 'run.resumed' ||
      event.type === 'run.phase_changed' ||
      event.type === 'run.waiting_for_user' ||
      event.type === 'interrupt.created' ||
      event.type === 'interrupt.resolved' ||
      event.type === 'interrupt.cancelled'
    ) {
      if (!('control' in event.payload)) return;
      const control = event.payload.control;
      if (!control) return;
      setSessionPending(sessionId, true);
      setSessionStates((current) => {
        const target = current[sessionId];
        if (!target) return current;
        return {
          ...current,
          [sessionId]: {
            ...target,
            activeInterrupt:
              event.type === 'interrupt.resolved' || event.type === 'interrupt.cancelled'
                ? undefined
                : 'interrupt' in event.payload
                  ? event.payload.interrupt
                  : control.activeInterrupt,
            workbench: target.workbench
              ? {
                  ...target.workbench,
                  activityStatus:
                    control.state === 'paused' ||
                    control.state === 'pause_requested' ||
                    control.state === 'resuming' ||
                    control.state === 'waiting_for_user'
                      ? control.state
                      : ('running' as const),
                  controlPhase: control.phase,
                  activeInterrupt:
                    event.type === 'interrupt.resolved' || event.type === 'interrupt.cancelled'
                      ? undefined
                      : 'interrupt' in event.payload
                        ? event.payload.interrupt
                        : control.activeInterrupt,
                }
              : target.workbench,
          },
        };
      });
      runSequencesRef.current[event.runId] = event.seq;
      return;
    }
    if (
      event.type === 'tool.started' ||
      event.type === 'tool.completed' ||
      event.type === 'tool.failed' ||
      event.type === 'tool.cancelled'
    ) {
      const toolEvent = event.payload as ToolStreamEvent;
      if (
        !target.conversation.some(
          (item) => item.kind === 'assistant' && item.id === toolEvent.messageId,
        )
      )
        throw new Error('RUN_EVENT_TARGET_MISSING');
      setSessionStates((current) => {
        const target = current[sessionId];
        if (!target) return current;
        const existing = target.workbench?.runId === event.runId ? target.workbench : undefined;
        const suppressed = target.autoOpenSuppressedRunIds?.includes(event.runId) ?? false;
        const hasNewResource =
          toolEvent.type === 'tool.completed' &&
          (toolEvent.toolName === 'web_search'
            ? toolEvent.result.results.length > 0
            : toolEvent.toolName === 'web_fetch' &&
              toolEvent.result.results.some(
                (item) => item.status === 'succeeded' && item.passages.length > 0,
              ));
        const currentUserUrls = new Set(
          [...task.matchAll(/https?:\/\/[^\s<>'"\])}]+/giu)].map((match) =>
            canonicalUrl(match[0].replace(/[.,;:!?，。；：！？]+$/gu, '')),
          ),
        );
        const workbench = applyToolEvent(
          existing,
          toolEvent,
          existing?.open === true || (!suppressed && hasNewResource),
          currentUserUrls,
        );
        workbench.runId = event.runId;
        workbench.context = target.context;
        workbench.executions = workbench.executions.map((item) => ({
          ...item,
          runId: event.runId,
        }));
        return {
          ...current,
          [sessionId]: {
            ...target,
            workbench,
            conversation: target.conversation.map((item) =>
              item.kind === 'assistant' && item.id === toolEvent.messageId
                ? { ...item, blocks: applyToolActivityEvent(item.blocks, toolEvent), workbench }
                : item,
            ),
          },
        };
      });
      runSequencesRef.current[event.runId] = event.seq;
      return;
    }
    if (
      event.type === 'run.completed' ||
      event.type === 'run.failed' ||
      event.type === 'run.cancelled'
    ) {
      const status =
        event.type === 'run.completed'
          ? 'completed'
          : event.type === 'run.cancelled'
            ? 'cancelled'
            : 'failed';
      setSessionPending(sessionId, false);
      setSessionStates((current) => {
        const target = current[sessionId];
        if (!target) return current;
        const workbench = target.workbench
          ? { ...target.workbench, activityStatus: status as WorkbenchState['activityStatus'] }
          : undefined;
        return {
          ...current,
          [sessionId]: {
            ...target,
            activeRunId: undefined,
            activeInterrupt: undefined,
            workbench,
            conversation: target.conversation.map((item) =>
              item.kind === 'assistant' && item.pending
                ? { ...item, pending: false, deliveryStatus: status, workbench }
                : item,
            ),
          },
        };
      });
      if (event.type === 'run.failed' && 'detail' in event.payload) setError(event.payload.detail);
      runSequencesRef.current[event.runId] = event.seq;
      return;
    }
    runSequencesRef.current[event.runId] = event.seq;
  }

  async function observeRun(
    sessionId: string,
    runId: string,
    task = '',
    skipInitialSnapshot = false,
  ): Promise<void> {
    // Observer 以 runId 独立存在，不绑定当前选中会话；切换视图不会中止后台生成。
    if (runControllersRef.current[runId]) return;
    const controller = new AbortController();
    runControllersRef.current[runId] = controller;
    setReconnectRunId((current) => (current === runId ? null : current));
    let terminalObserved = false;
    try {
      // 每轮恢复先读取 Latest Snapshot，再携带当前 cursor 订阅 SSE；指数退避期间 Run 继续在服务端执行。
      for (const [attempt, delay] of [0, 1_000, 2_000, 4_000, 8_000].entries()) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (controller.signal.aborted) return;
        // 新建 Run 已有乐观消息，首连可跳过额外 Snapshot；重连必须先校准 Durable/Live 状态。
        if (!(skipInitialSnapshot && attempt === 0)) {
          const snapshot = await getRun(runId, controller.signal);
          applyRunSnapshot(sessionId, snapshot);
          if (['completed', 'failed', 'cancelled'].includes(snapshot.status)) {
            terminalObserved = true;
            return;
          }
        }
        try {
          // Last-Event-ID 使用“最后成功应用”的 cursor，而不是最后收到或最后解析的事件。
          await subscribeRun(
            runId,
            runSequencesRef.current[runId],
            (event) => {
              applyRunEvent(sessionId, event, task);
              terminalObserved =
                event.type === 'run.completed' ||
                event.type === 'run.failed' ||
                event.type === 'run.cancelled' ||
                (event.type === 'run.snapshot' &&
                  'status' in event.payload &&
                  ['completed', 'failed', 'cancelled'].includes(event.payload.status));
            },
            controller.signal,
          );
          if (terminalObserved) return;
        } catch (requestError) {
          if (controller.signal.aborted) return;
          if (delay === 8_000) throw requestError;
          continue;
        }
      }
    } catch (requestError) {
      if (!controller.signal.aborted) setError(getErrorMessage(requestError));
      if (!controller.signal.aborted) setReconnectRunId(runId);
    } finally {
      delete runControllersRef.current[runId];
      if (!controller.signal.aborted) {
        try {
          // Terminal 后数据库是最终事实；非 Terminal 断流则用 Snapshot 补齐当前可见草稿。
          if (terminalObserved) {
            setReconnectRunId(null);
            await loadSessionDetail(sessionId);
          } else {
            const snapshot = await getRun(runId);
            applyRunSnapshot(sessionId, snapshot);
          }
          await refreshSessions();
        } catch {
          // Run 已持久化；最终刷新失败时保留当前投影。
        }
      }
    }
  }

  // 首次进入时检查服务、加载列表并恢复 URL 指定或最近会话。
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([getReadiness(controller.signal), listSessions(controller.signal)])
      .then(([, loadedSessions]) => {
        setServiceState('ready');
        setSessions(loadedSessions);
        const requestedId = new URLSearchParams(window.location.search).get('session');
        const target =
          loadedSessions.find((session) => session.id === requestedId) ?? loadedSessions[0];
        if (target) {
          setSelectedSession(target.id);
          updateSessionUrl(target.id, true);
          void loadSessionDetail(target.id);
        } else {
          updateSessionUrl(null, true);
        }
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setServiceState('unavailable');
        setError(getErrorMessage(requestError));
      });
    return () => controller.abort();
    // Initial bootstrap intentionally runs once; subsequent session loads are user or Run driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从 API 覆盖指定会话缓存，以数据库结果作为最终事实。
  // Active Run 期间禁止旧详情覆盖本地 Live Projection，改由独立 Run Observer 负责增量恢复。
  async function loadSessionDetail(sessionId: string): Promise<void> {
    if (pendingSessionsRef.current[sessionId]) return;
    try {
      const { session } = await getSession(sessionId);
      if (pendingSessionsRef.current[sessionId]) return;
      setSessionStates((current) => {
        const conversation = session.messages.map(toConversationItem);
        const activeWorkbench = current[sessionId]?.workbench;
        const restoredItem =
          (activeWorkbench
            ? conversation.find(
                (item) =>
                  item.kind === 'assistant' &&
                  (item.workbench?.runId === activeWorkbench.runId ||
                    item.id === activeWorkbench.runId),
              )
            : undefined) ??
          [...conversation].reverse().find((item) => item.kind === 'assistant' && item.workbench);
        const restoredWorkbench =
          restoredItem?.kind === 'assistant' ? restoredItem.workbench : undefined;
        const cachedContext = activeWorkbench?.context ?? current[sessionId]?.context;
        return {
          ...current,
          [sessionId]: {
            label: session.title,
            subtitle: '',
            conversation,
            ...(restoredWorkbench
              ? {
                  workbench: {
                    ...restoredWorkbench,
                    open: activeWorkbench?.open ?? false,
                    activeView: activeWorkbench?.activeView ?? restoredWorkbench.activeView,
                    ...(cachedContext ? { context: cachedContext } : {}),
                  },
                }
              : {}),
            ...(cachedContext ? { context: cachedContext } : {}),
            autoOpenSuppressedRunIds: current[sessionId]?.autoOpenSuppressedRunIds,
          },
        };
      });
      if (session.activeRun) {
        setSessionPending(sessionId, true);
        void observeRun(sessionId, session.activeRun.runId);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  // 重新读取侧栏顺序，同时保留各会话独立内容缓存。
  async function refreshSessions(): Promise<SessionSummary[]> {
    const loaded = await listSessions();
    setSessions(loaded);
    return loaded;
  }

  // 切换会话只改变当前视图：先展示目标缓存，再异步刷新详情；不会 abort 任何 Run Observer。
  function selectSession(sessionId: string): void {
    draftSubmissionTokenRef.current += 1;
    setDraftPending(false);
    setSelectedSession(sessionId);
    setPrompt('');
    setError(null);
    updateSessionUrl(sessionId);
    setMobileNavOpen(false);
    void loadSessionDetail(sessionId);
  }

  // 新建按钮只进入本地空白草稿，不提前写数据库。
  function startDraft(): void {
    draftSubmissionTokenRef.current += 1;
    setDraftPending(false);
    setSelectedSession(null);
    setDraftState(makeFixture('empty'));
    setPrompt('');
    setError(null);
    updateSessionUrl(null);
    setMobileNavOpen(false);
  }

  // 从内联 Tool Activity 打开并定位当前会话的 Workbench 调用详情。
  function focusCurrentWorkbench(target: WorkbenchFocusTarget): void {
    const sessionId = selectedSessionIdRef.current ?? selectedSessionId;
    if (!sessionId) return;
    setSessionStates((current) => {
      const state = current[sessionId];
      if (!state) return current;
      const historicalItem = state.conversation.find(
        (item) =>
          item.kind === 'assistant' &&
          (item.workbench?.runId === target.runId || item.id === target.runId),
      );
      const historical =
        historicalItem?.kind === 'assistant' ? historicalItem.workbench : undefined;
      const workbench = state.workbench?.runId === target.runId ? state.workbench : historical;
      if (!workbench) return current;
      const activeView: WorkspaceView =
        target.kind === 'source' ? 'sources' : target.kind === 'report' ? 'report' : 'activity';
      return {
        ...current,
        [sessionId]: {
          ...state,
          workbench: {
            ...workbench,
            open: true,
            activeView,
            focusTarget: target,
            followMode: 'pinned',
          },
        },
      };
    });
  }

  // 删除确认后的会话，并按最新列表决定恢复落点。
  async function removeSession(sessionId: string): Promise<void> {
    try {
      await deleteSession(sessionId);
      setSessionStates((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      const remaining = await refreshSessions();
      if (selectedSessionIdRef.current !== sessionId) return;
      const next = remaining[0];
      if (next) selectSession(next.id);
      else startDraft();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  // 持久化会话局部更新，并同步侧栏与当前会话标题。
  async function modifySession(
    sessionId: string,
    input: { title?: string; isPinned?: boolean },
  ): Promise<void> {
    try {
      const updated = await updateSession(sessionId, input);
      setSessions((current) =>
        sortSessionSummaries(
          current.map((session) => (session.id === sessionId ? updated : session)),
        ),
      );
      if (input.title !== undefined) {
        setSessionStates((current) =>
          current[sessionId]
            ? { ...current, [sessionId]: { ...current[sessionId], label: updated.title } }
            : current,
        );
      }
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    }
  }

  // 提交消息；空白草稿先建会话，之后捕获稳定 targetId，异步流只更新该 Session。
  // 用户在生成期间切换到其他会话也不会让 Event 写入当前选中的错误目标。
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const task = prompt.trim();
    const currentId = selectedSessionIdRef.current;
    if (!task || (currentId ? pendingSessions[currentId] : draftPending)) return;
    setPrompt('');
    setError(null);
    const createdAt = new Date().toISOString();
    // 乐观 ID 在服务端返回真实 messageId 前稳定定位本轮消息。
    const localUserId = `local-user-${crypto.randomUUID()}`;
    const localAssistantId = `local-assistant-${crypto.randomUUID()}`;
    let assistantMessageId = localAssistantId;
    let sessionId = currentId;
    const draftSubmissionToken = currentId ? undefined : ++draftSubmissionTokenRef.current;
    const optimisticUser: ConversationItem = {
      id: localUserId,
      kind: 'user',
      content: task,
      createdAt,
    };
    const optimisticAssistant: ConversationItem = {
      id: localAssistantId,
      kind: 'assistant',
      createdAt,
      blocks: [],
      pending: true,
      deliveryStatus: 'streaming',
    };
    if (!sessionId) {
      setDraftPending(true);
      setDraftState({
        label: makeProvisionalTitle(task),
        subtitle: '',
        conversation: [optimisticUser, optimisticAssistant],
      });
    }

    try {
      if (!sessionId) {
        const created = await createSession(makeProvisionalTitle(task));
        sessionId = created.id;
        setSessions((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        // 用户可能已经切换到其他会话；旧草稿请求仍继续观察自己的 Run，
        // 但不得改变当前选中的会话或地址栏。
        if (draftSubmissionToken === draftSubmissionTokenRef.current) {
          setSelectedSession(created.id);
          updateSessionUrl(created.id, true);
        }
      }

      const targetId = sessionId;
      setSessionStates((current) => {
        const base = current[targetId] ?? {
          label: makeProvisionalTitle(task),
          subtitle: '',
          conversation: [],
        };
        return {
          ...current,
          [targetId]: {
            ...base,
            conversation: [...base.conversation, optimisticUser, optimisticAssistant],
          },
        };
      });
      setSessionPending(targetId, true);

      if (!selectedModel) throw new Error('模型配置尚未加载，请稍后重试。');
      const run = await createRun(targetId, task, selectedModel, reasoningEffort);
      assistantMessageId = run.assistantMessageId;
      setSessionStates((current) => {
        const target = current[targetId];
        if (!target) return current;
        return {
          ...current,
          [targetId]: {
            ...target,
            activeRunId: run.runId,
            conversation: target.conversation.map((item) =>
              item.id === localUserId
                ? { ...item, id: run.userMessageId }
                : item.id === localAssistantId
                  ? { ...item, id: run.assistantMessageId }
                  : item,
            ),
          },
        };
      });
      await observeRun(targetId, run.runId, task, true);
      try {
        await refreshSessions();
      } catch {
        // 回答已经交付，侧栏刷新失败不回滚消息。
      }
    } catch (requestError) {
      if (sessionId) {
        const targetId = sessionId;
        setSessionStates((current) => {
          const target = current[targetId];
          if (!target) return current;
          return {
            ...current,
            [targetId]: {
              ...target,
              conversation: target.conversation.map((item) =>
                item.kind === 'assistant' && item.id === assistantMessageId
                  ? {
                      ...item,
                      pending: false,
                      deliveryStatus: 'failed',
                      blocks: item.blocks.length
                        ? item.blocks
                        : [
                            {
                              id: `${assistantMessageId}-failed`,
                              type: 'text',
                              content: '本次回答未完成，请稍后重试。',
                            },
                          ],
                    }
                  : item,
              ),
            },
          };
        });
        void refreshSessions();
      } else {
        setPrompt(task);
        setDraftState(makeFixture('empty'));
      }
      setError(getErrorMessage(requestError));
    } finally {
      if (sessionId) {
        const targetId = sessionId;
        setSessionPending(targetId, false);
      }
      if (
        draftSubmissionToken === undefined ||
        draftSubmissionToken === draftSubmissionTokenRef.current
      )
        setDraftPending(false);
    }
  }

  async function handleCancel(): Promise<void> {
    const sessionId = selectedSessionIdRef.current;
    const runId = sessionId ? sessionStates[sessionId]?.activeRunId : undefined;
    if (!sessionId || !runId) return;
    try {
      await cancelRun(runId);
      setSessionStates((current) =>
        current[sessionId]
          ? {
              ...current,
              [sessionId]: {
                ...current[sessionId],
                workbench: current[sessionId].workbench
                  ? { ...current[sessionId].workbench, activityStatus: 'cancelling' }
                  : undefined,
              },
            }
          : current,
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function handlePause(): Promise<void> {
    const sessionId = selectedSessionIdRef.current;
    const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
    if (!sessionId || !runId) return;
    try {
      const result = await controlRun(runId, { type: 'pause' });
      applyRunSnapshot(sessionId, result.snapshot);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function handleResume(): Promise<void> {
    const sessionId = selectedSessionIdRef.current;
    const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
    if (!sessionId || !runId) return;
    try {
      const result = await controlRun(runId, { type: 'resume' });
      applyRunSnapshot(sessionId, result.snapshot);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function handleClarificationResponse(interruptId: string, answer: string): Promise<void> {
    const sessionId = selectedSessionIdRef.current;
    const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
    if (!sessionId || !runId) return;
    try {
      const result = await controlRun(runId, {
        type: 'respond',
        interruptId,
        payload: { answer },
      });
      applyRunSnapshot(sessionId, result.snapshot);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      try {
        applyRunSnapshot(sessionId, await getRun(runId));
      } catch {
        // 保留原始命令错误。
      }
    }
  }

  async function handleApprovalResponse(
    interruptId: string,
    decisions: ToolApprovalDecision[],
  ): Promise<void> {
    const sessionId = selectedSessionIdRef.current;
    const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
    if (!sessionId || !runId) return;
    try {
      const result = await controlRun(runId, {
        type: decisions.every((decision) => decision.decision === 'reject') ? 'reject' : 'approve',
        interruptId,
        decisions,
      });
      applyRunSnapshot(sessionId, result.snapshot);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      try {
        applyRunSnapshot(sessionId, await getRun(runId));
      } catch {
        // 保留原始命令错误。
      }
    }
  }

  // 以下派生状态统一决定当前 Conversation、Composer 和 Workbench 布局。
  const uiState = selectedSessionId
    ? (sessionStates[selectedSessionId] ?? {
        label: sessions.find((session) => session.id === selectedSessionId)?.title ?? '加载中…',
        subtitle: '',
        conversation: [],
      })
    : draftState;
  const submitting = selectedSessionId ? Boolean(pendingSessions[selectedSessionId]) : draftPending;
  const hasWorkbench = Boolean(uiState.workbench?.open);

  return (
    <div className="app-shell grid h-screen min-h-screen min-w-0 grid-cols-[252px_minmax(0,1fr)] overflow-hidden bg-sidebar text-text-primary max-[720px]:block max-[720px]:h-auto max-[720px]:min-h-screen max-[720px]:overflow-visible">
      <Sidebar
        serviceState={serviceState}
        serviceLabel=""
        mobileNavOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        pendingSessions={pendingSessions}
        onNew={startDraft}
        onSelect={selectSession}
        onDelete={(sessionId) => {
          const target = sessions.find((session) => session.id === sessionId);
          if (target) setDeleteTarget(target);
        }}
        onRename={(sessionId, title) => modifySession(sessionId, { title })}
        onTogglePin={(sessionId, isPinned) => void modifySession(sessionId, { isPinned })}
      />
      {mobileNavOpen ? (
        <button
          className="mobile-backdrop"
          type="button"
          aria-label="关闭会话栏"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
            <DialogDescription>
              确定删除“{deleteTarget?.title ?? '未命名会话'}
              ”吗？会话中的消息、报告和证据也会一并删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogCancel>取消</DialogCancel>
            <DialogAction
              className="ui-dialog-action--destructive"
              type="button"
              onClick={() => {
                if (!deleteTarget) return;
                const sessionId = deleteTarget.id;
                setDeleteTarget(null);
                void removeSession(sessionId);
              }}
            >
              删除
            </DialogAction>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <main className="main-shell my-2 mr-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-surface">
        <div
          className={`workbench-grid min-h-0 min-w-0 flex-1 overflow-hidden ${hasWorkbench ? 'has-workbench' : 'without-workbench'}`}
        >
          <section className="conversation-column">
            <header className="topbar flex min-h-[66px] items-center gap-2.5 bg-surface px-[26px] text-text-primary max-[720px]:min-h-[62px] max-[720px]:px-4">
              <button
                className="icon-button open-mobile-nav"
                type="button"
                aria-label="打开会话栏"
                title="打开会话栏"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu size={18} />
              </button>
              <div className="task-title flex min-w-0 items-baseline gap-2.5 max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-0.5">
                <span className="task-title__label overflow-hidden text-ellipsis whitespace-nowrap text-base">
                  {uiState.label}
                </span>
              </div>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </header>
            <Conversation
              state={uiState}
              error={error}
              onDismissError={() => setError(null)}
              onReconnect={
                reconnectRunId && selectedSessionId
                  ? () => {
                      setError(null);
                      setReconnectRunId(null);
                      void observeRun(selectedSessionId, reconnectRunId);
                    }
                  : undefined
              }
              onFocusWorkbench={focusCurrentWorkbench}
              prompt={prompt}
              submitting={submitting}
              serviceState={serviceState}
              composerMode="new-run"
              reasoningEffort={reasoningEffort}
              models={models}
              selectedModel={selectedModel}
              onModelChange={(modelId) => {
                const model = models.find((candidate) => candidate.id === modelId);
                if (!model) return;
                setSelectedModel(model.id);
                if (!model.reasoning.levels.includes(reasoningEffort))
                  setReasoningEffort(model.reasoning.default);
              }}
              onReasoningEffortChange={setReasoningEffort}
              onPromptChange={setPrompt}
              onSubmit={(event) => void handleSubmit(event)}
              onPause={() => void handlePause()}
              onResume={() => void handleResume()}
              onCancel={() => void handleCancel()}
              onClarificationRespond={(interruptId, answer) =>
                void handleClarificationResponse(interruptId, answer)
              }
              onApprovalSubmit={(interruptId, decisions) =>
                void handleApprovalResponse(interruptId, decisions)
              }
            />
          </section>
          {uiState.workbench ? (
            <WorkbenchShell
              state={uiState.workbench}
              onViewChange={(activeView) => {
                if (!selectedSessionId) return;
                setSessionStates((current) =>
                  current[selectedSessionId]?.workbench
                    ? {
                        ...current,
                        [selectedSessionId]: {
                          ...current[selectedSessionId],
                          workbench: { ...current[selectedSessionId].workbench!, activeView },
                        },
                      }
                    : current,
                );
              }}
              onExecutionSelect={(tool) => {
                if (!selectedSessionId) return;
                setSessionStates((current) =>
                  current[selectedSessionId]?.workbench
                    ? {
                        ...current,
                        [selectedSessionId]: {
                          ...current[selectedSessionId],
                          workbench: {
                            ...current[selectedSessionId].workbench!,
                            followMode: 'pinned',
                            focusTarget: {
                              kind: 'tool_call',
                              runId: tool.runId,
                              stepId: tool.stepId,
                              toolCallId: tool.toolCallId,
                            },
                          },
                        },
                      }
                    : current,
                );
              }}
              onClose={() => {
                if (!selectedSessionId) return;
                setSessionStates((current) => {
                  const state = current[selectedSessionId];
                  if (!state?.workbench) return current;
                  return {
                    ...current,
                    [selectedSessionId]: {
                      ...state,
                      autoOpenSuppressedRunIds: [
                        ...new Set([
                          ...(state.autoOpenSuppressedRunIds ?? []),
                          state.workbench.runId,
                        ]),
                      ],
                      workbench: { ...state.workbench, open: false },
                    },
                  };
                });
              }}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

// 渲染仅开发环境可用的 fixture 状态切换器。
function PreviewSwitcher({ active }: { active: PreviewState }) {
  return (
    <div className="preview-switcher" role="navigation" aria-label="预览状态">
      <span className="preview-switcher__label">Mock</span>
      <div className="preview-switcher__states">
        {PREVIEW_STATES.map((item) => (
          <a
            key={item.id}
            className={`preview-chip ${active === item.id ? 'is-active' : ''}`}
            href={`/agent/preview?state=${item.id}`}
            aria-current={active === item.id ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// 管理开发预览中的对话与 Workbench 状态转换。
export function AppShell({
  previewState,
  theme,
  onToggleTheme,
}: {
  previewState?: AgentUiState;
  theme?: Theme;
  onToggleTheme?: () => void;
}) {
  const activeTheme = theme ?? 'light';
  const toggleTheme = onToggleTheme ?? (() => undefined);
  const [serviceState, setServiceState] = useState<ServiceState>(
    previewState ? 'ready' : 'checking',
  );
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uiState, setUiState] = useState<AgentUiState>(previewState ?? makeFixture('empty'));

  useEffect(() => {
    if (previewState) return;
    const controller = new AbortController();
    void getReadiness(controller.signal)
      .then(() => setServiceState('ready'))
      .catch(() => setServiceState('unavailable'));
    return () => controller.abort();
  }, [previewState]);

  const composerMode = 'new-run' as const;

  // 打开 Workbench 并记录用户是否固定了当前定位。
  function focusWorkbench(target: WorkbenchFocusTarget, pinned = true) {
    setUiState((current) => {
      if (!current.workbench || current.workbench.runId !== target.runId) return current;
      const activeView: WorkspaceView =
        target.kind === 'source' ? 'sources' : target.kind === 'report' ? 'report' : 'activity';
      return {
        ...current,
        workbench: {
          ...current.workbench,
          open: true,
          activeView,
          focusTarget: target,
          followMode: pinned ? 'pinned' : 'auto',
        },
      };
    });
  }

  // 处理预览输入，追加一组不调用生产 API 的本地消息。
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const task = prompt.trim();
    if (!task || submitting) return;
    setSubmitting(true);
    setError(null);
    setPrompt('');
    if (previewState) {
      const now = Date.now();
      setUiState((current) => ({
        ...current,
        label: current.conversation.length
          ? current.label
          : task.slice(0, AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength),
        conversation: [
          ...current.conversation,
          { id: `u-${now}`, kind: 'user', content: task, createdAt: new Date().toISOString() },
          {
            id: `a-${now}`,
            kind: 'assistant',
            blocks: [
              { id: `a-${now}-text-1`, type: 'text', content: '这是开发预览中的本地回复。' },
            ],
          },
        ],
      }));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  const serviceLabel = SERVICE_STATE_LABELS[serviceState];
  const hasWorkbench = Boolean(uiState.workbench?.open);
  return (
    <div className="app-shell grid h-screen min-h-screen min-w-0 grid-cols-[252px_minmax(0,1fr)] overflow-hidden bg-canvas text-text-primary max-[720px]:block max-[720px]:h-auto max-[720px]:min-h-screen max-[720px]:overflow-visible">
      <Sidebar
        serviceState={serviceState}
        serviceLabel={serviceLabel}
        mobileNavOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      {mobileNavOpen ? (
        <button
          className="mobile-backdrop"
          type="button"
          aria-label="关闭会话栏"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <main className="main-shell flex h-screen min-h-0 min-w-0 flex-col overflow-hidden bg-surface max-[720px]:h-auto max-[720px]:min-h-screen max-[720px]:overflow-visible">
        <div
          className={`workbench-grid min-h-0 min-w-0 flex-1 overflow-hidden ${hasWorkbench ? 'has-workbench' : 'without-workbench'}`}
        >
          <section className="conversation-column">
            <header className="topbar flex min-h-[66px] items-center gap-2.5 bg-surface px-[26px] text-text-primary max-[720px]:min-h-[62px] max-[720px]:px-4">
              <button
                className="icon-button open-mobile-nav"
                type="button"
                aria-label="打开会话栏"
                title="打开会话栏"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu size={18} />
              </button>
              <div className="task-title flex min-w-0 items-baseline gap-2.5 max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-0.5">
                <span className="task-title__label overflow-hidden text-ellipsis whitespace-nowrap text-base">
                  {uiState.label}
                </span>
                {uiState.subtitle ? (
                  <span className="task-title__meta">{uiState.subtitle}</span>
                ) : null}
              </div>
              <ThemeToggle theme={activeTheme} onToggle={toggleTheme} />
            </header>
            <Conversation
              state={uiState}
              error={error}
              onDismissError={() => setError(null)}
              onFocusWorkbench={(target) => focusWorkbench(target)}
              prompt={prompt}
              submitting={submitting}
              serviceState={serviceState}
              composerMode={composerMode}
              onPromptChange={setPrompt}
              onSubmit={handleSubmit}
            />
          </section>
          {uiState.workbench ? (
            <WorkbenchShell
              state={uiState.workbench}
              onViewChange={(activeView) =>
                setUiState((current) =>
                  current.workbench
                    ? { ...current, workbench: { ...current.workbench, activeView } }
                    : current,
                )
              }
              onExecutionSelect={(tool) =>
                focusWorkbench({
                  kind: 'tool_call',
                  runId: tool.runId,
                  stepId: tool.stepId,
                  toolCallId: tool.toolCallId,
                })
              }
              onClose={() =>
                setUiState((current) => {
                  if (!current.workbench) return current;
                  return {
                    ...current,
                    autoOpenSuppressedRunIds: [
                      ...new Set([
                        ...(current.autoOpenSuppressedRunIds ?? []),
                        current.workbench.runId,
                      ]),
                    ],
                    workbench: { ...current.workbench, open: false },
                  };
                })
              }
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

// 渲染会话导航和当前本地工作区身份。
function Sidebar({
  serviceState,
  serviceLabel,
  mobileNavOpen,
  onClose,
  sessions,
  selectedSessionId,
  pendingSessions,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
}: {
  serviceState: ServiceState;
  serviceLabel: string;
  mobileNavOpen: boolean;
  onClose: () => void;
  sessions?: SessionSummary[];
  selectedSessionId?: string | null;
  pendingSessions?: Record<string, boolean>;
  onNew?: () => void;
  onSelect?: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  onRename?: (sessionId: string, title: string) => Promise<void>;
  onTogglePin?: (sessionId: string, isPinned: boolean) => void;
}) {
  // 菜单状态同时保存目标会话和视口坐标，避免菜单受侧栏滚动裁剪。
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  // 重命名状态独立于操作菜单，关闭菜单后仍可完成对话框提交。
  const [editingSession, setEditingSession] = useState<SessionSummary | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // 在菜单外点击或按 Escape 时关闭临时操作界面。
  useEffect(() => {
    function closeTransientUi(event: PointerEvent | KeyboardEvent): void {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setMenuSessionId(null);
        setMenuAnchor(null);
        if (!savingTitle) setEditingSession(null);
        return;
      }
      if (
        event instanceof PointerEvent &&
        !(event.target as Element).closest('.session-actions, .session-menu')
      ) {
        setMenuSessionId(null);
        setMenuAnchor(null);
      }
    }
    document.addEventListener('pointerdown', closeTransientUi);
    document.addEventListener('keydown', closeTransientUi);
    return () => {
      document.removeEventListener('pointerdown', closeTransientUi);
      document.removeEventListener('keydown', closeTransientUi);
    };
  }, [savingTitle]);

  // 打开重命名对话框并预填当前标题。
  function openRename(session: SessionSummary): void {
    setMenuSessionId(null);
    setMenuAnchor(null);
    setEditingSession(session);
    setEditTitle(session.title);
  }

  // 将菜单锚定到更多按钮下方，必要时先滚动列表为菜单留出空间。
  function toggleSessionMenu(sessionId: string, event: ReactMouseEvent<HTMLButtonElement>): void {
    if (menuSessionId === sessionId) {
      setMenuSessionId(null);
      setMenuAnchor(null);
      return;
    }
    const button = event.currentTarget;
    const list = button.closest('.session-list');
    const initialRect = button.getBoundingClientRect();
    const overflow = initialRect.bottom + 142 - window.innerHeight;

    const openAtCurrentPosition = () => {
      const rect = button.getBoundingClientRect();
      setMenuAnchor({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - 154, window.innerWidth - 162)),
      });
      setMenuSessionId(sessionId);
    };

    if (overflow > 0 && list) {
      list.scrollBy({ top: overflow + 8 });
      requestAnimationFrame(openAtCurrentPosition);
    } else {
      openAtCurrentPosition();
    }
  }

  // 校验并提交新的会话名称。
  async function submitRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const title = editTitle.replace(/\s+/g, ' ').trim();
    if (
      !editingSession ||
      !title ||
      title.length > AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength ||
      title === editingSession.title
    )
      return;
    setSavingTitle(true);
    try {
      await onRename?.(editingSession.id, title);
      setEditingSession(null);
    } finally {
      setSavingTitle(false);
    }
  }

  return (
    <>
      <aside
        className={`session-sidebar flex h-screen min-h-screen min-w-0 flex-col overflow-hidden bg-sidebar p-[22px_0_16px_14px] max-[720px]:fixed max-[720px]:inset-y-0 max-[720px]:left-0 max-[720px]:z-20 max-[720px]:w-[min(286px,86vw)] max-[720px]:-translate-x-[102%] max-[720px]:transition-transform ${mobileNavOpen ? 'session-sidebar--open max-[720px]:translate-x-0' : ''}`}
      >
        <div className="brand-row flex items-center gap-2.5 px-2 pb-7 pr-[22px]">
          <div
            className="brand-mark grid h-8 w-8 place-items-center rounded-[9px] border border-accent bg-accent text-white"
            aria-hidden="true"
          >
            H
          </div>
          <div className="min-w-0">
            <strong className="block text-base">Harness</strong>
            <span className="mt-0.5 block text-xs text-text-muted">Agent Workbench</span>
          </div>
          <button
            className="icon-button close-mobile-nav"
            type="button"
            aria-label="关闭会话栏"
            title="关闭会话栏"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="sidebar-heading flex items-center justify-between px-2 pb-2 pr-[22px] text-xs font-bold uppercase tracking-[0.08em] text-text-muted">
          <span>会话</span>
          <button
            className="icon-button"
            type="button"
            aria-label="新建会话"
            title="新建会话"
            onClick={onNew}
          >
            <Plus size={18} />
          </button>
        </div>
        <div
          className="session-list min-h-0 flex-1 overflow-y-auto pr-1.5 pb-[140px]"
          onMouseEnter={(event) => event.currentTarget.classList.add('is-scroll-active')}
          onMouseLeave={(event) => event.currentTarget.classList.remove('is-scroll-active')}
        >
          {sessions && selectedSessionId === null ? (
            <div className="session-row">
              <button className="session-item is-active mb-0.5 flex min-h-[38px] w-full items-center gap-2 rounded-xl border border-transparent bg-surface-hover px-2.5 py-2 pr-12 text-left text-text-primary transition-colors hover:bg-surface-hover">
                <span className="session-item__title min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal">
                  {AGENT_UI_COPY.defaultSessionTitle}
                </span>
              </button>
            </div>
          ) : null}
          {sessions ? (
            sessions.map((session) => (
              <div className="session-row" key={session.id}>
                <button
                  className={`session-item mb-0.5 flex min-h-[38px] w-full items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 pr-12 text-left text-text-primary transition-colors hover:bg-surface-hover ${selectedSessionId === session.id ? 'is-active bg-surface-hover' : ''}`}
                  type="button"
                  onClick={() => onSelect?.(session.id)}
                  aria-label={
                    pendingSessions?.[session.id] ? `${session.title}，正在生成回复` : session.title
                  }
                >
                  {pendingSessions?.[session.id] ? (
                    <span className="activity-bars session-activity" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : null}
                  <span className="session-item__title min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal">
                    {session.title}
                  </span>
                </button>
                <div className="session-actions">
                  <button
                    className="session-more icon-button icon-button--small"
                    type="button"
                    aria-label={`更多操作 ${session.title}`}
                    aria-haspopup="menu"
                    aria-expanded={menuSessionId === session.id}
                    title="更多操作"
                    onClick={(event) => toggleSessionMenu(session.id, event)}
                  >
                    <Ellipsis size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <>
              <button
                className="session-item is-active mb-0.5 flex min-h-[38px] w-full items-center gap-2 rounded-xl border border-transparent bg-surface-hover px-2.5 py-2 pr-12 text-left text-text-primary transition-colors hover:bg-surface-hover"
                type="button"
              >
                <span className="session-item__title min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal">
                  {AGENT_UI_COPY.defaultSessionTitle}
                </span>
              </button>
              <div className="sidebar-section mt-6 flex items-center justify-between px-2 pb-2 pr-[22px] text-xs font-bold uppercase tracking-[0.08em] text-text-muted">
                <span>最近使用</span>
              </div>
              <div className="sessions-empty">
                <span>暂无其他会话</span>
              </div>
            </>
          )}
          {sessions && sessions.length === 0 && selectedSessionId !== null ? (
            <div className="sessions-empty">
              <span>暂无会话</span>
            </div>
          ) : null}
        </div>
        {serviceLabel ? (
          <div className="sidebar-footer mt-auto flex items-center gap-2 px-2 pt-3 text-xs text-text-muted">
            <span className={`status-dot status-dot--${serviceState}`} aria-hidden="true" />
            <span>{serviceLabel}</span>
            <span className="local-badge">本地</span>
          </div>
        ) : null}
      </aside>
      {menuSessionId && menuAnchor && sessions
        ? (() => {
            const session = sessions.find((item) => item.id === menuSessionId);
            return session
              ? createPortal(
                  <div
                    className="session-menu"
                    role="menu"
                    aria-label={`${session.title} 会话操作`}
                    style={{ top: menuAnchor.top, left: menuAnchor.left }}
                  >
                    <button type="button" role="menuitem" onClick={() => openRename(session)}>
                      <Pencil size={15} />
                      <span>重命名</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuSessionId(null);
                        setMenuAnchor(null);
                        onTogglePin?.(session.id, !session.isPinned);
                      }}
                    >
                      {session.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
                      <span>{session.isPinned ? '取消置顶' : '置顶'}</span>
                    </button>
                    <div className="session-menu__separator" />
                    <button
                      className="session-menu__danger"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuSessionId(null);
                        setMenuAnchor(null);
                        onDelete?.(session.id);
                      }}
                    >
                      <Trash2 size={15} />
                      <span>删除</span>
                    </button>
                  </div>,
                  document.body,
                )
              : null;
          })()
        : null}
      {editingSession
        ? createPortal(
            <div
              className="rename-dialog-backdrop"
              role="presentation"
              onMouseDown={() => !savingTitle && setEditingSession(null)}
            >
              <form
                className="rename-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="rename-dialog-title"
                onSubmit={(event) => void submitRename(event)}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="rename-dialog__header">
                  <h2 id="rename-dialog-title">编辑会话名称</h2>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="关闭"
                    onClick={() => setEditingSession(null)}
                    disabled={savingTitle}
                  >
                    <X size={18} />
                  </button>
                </div>
                <label htmlFor="session-title-input">会话名称</label>
                <input
                  id="session-title-input"
                  autoFocus
                  maxLength={AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength}
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
                <div className="rename-dialog__actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setEditingSession(null)}
                    disabled={savingTitle}
                  >
                    取消
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={
                      savingTitle || !editTitle.trim() || editTitle.trim() === editingSession.title
                    }
                  >
                    {savingTitle ? '保存中…' : '确认'}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
