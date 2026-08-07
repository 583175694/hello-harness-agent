import {
  Ellipsis,
  Menu,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
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
  createSession,
  deleteSession,
  generateSessionTitle,
  getReadiness,
  getSession,
  listSessions,
  requestChatStream,
  updateSession,
} from './api/client';
import type { ToolStreamEvent } from './api/client';
import { AGENT_PROTOCOL_LIMITS, assistantAgentMetadataSchema } from '@harness/agent-protocol';
import type { AssistantContentBlock, PersistedMessage, SessionSummary } from '@harness/agent-protocol';
import type {
  AgentUiState,
  ConversationItem,
  PreviewState,
  ServiceState,
  ToolCallView,
  WorkbenchFocusTarget,
  WorkbenchState,
  WorkspaceView,
} from './features/agent/model/types';
import { appendTextDelta, applyToolActivityEvent, cloneAssistantBlocks } from './features/agent/model/conversation-blocks';
import { WorkbenchShell } from './features/agent/components/workbench-views';
import { Conversation } from './features/agent/components/conversation';
import { PREVIEW_STATES, makeFixture } from './features/agent/fixtures/preview';
import { AGENT_UI_COPY, SERVICE_STATE_LABELS } from './features/agent/config/ui.constants';


// 将传输和供应商异常转换为用户可读的提示文案。
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiProblem) return error.problem.detail;
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
  const preview = getPreviewState();
  return (
    <>
      {preview ? <AppShell key={preview} previewState={makeFixture(preview)} /> : <PersistentAgentApp />}
      {preview ? <PreviewSwitcher active={preview} /> : null}
    </>
  );
}

// 将工具耗时格式化为适合 Workbench 展示的短文本。
function formatToolDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs} 毫秒` : `${(durationMs / 1000).toFixed(1)} 秒`;
}

// 将持久化 assistant metadata 投影为可恢复的轻量 Workbench。
function workbenchFromPersistedMessage(message: PersistedMessage): WorkbenchState | undefined {
  if (message.role !== 'assistant') return undefined;
  const metadata = assistantAgentMetadataSchema.safeParse(message.metadata);
  if (!metadata.success || !metadata.data.agent?.executions.length) return undefined;
  const { executions, sources } = metadata.data.agent;
  const completedCount = executions.filter((execution) => execution.status === 'completed').length;
  const cancelledCount = executions.filter((execution) => execution.status === 'cancelled').length;
  return {
    runId: message.id,
    title: AGENT_UI_COPY.searchWorkbenchTitle,
    subtitle: `${executions.length} 次调用 · ${sources.length} 个检索线索`,
    activeView: sources.length ? 'sources' : 'activity',
    activityStatus: completedCount ? 'completed' : cancelledCount === executions.length ? 'cancelled' : 'failed',
    executions: executions.map((execution) => ({
      toolCallId: execution.toolCallId,
      runId: message.id,
      stepId: execution.toolCallId,
      toolName: execution.toolName,
      title: `搜索：${execution.input.query}`,
      detail: execution.status === 'completed' ? '公开网页检索已完成' : execution.status === 'cancelled' ? '网页检索已取消' : '网页检索未完成',
      status: execution.status,
      elapsed: formatToolDuration(execution.durationMs),
      inputSummary: execution.input.query,
      outputSummary: execution.status === 'completed'
        ? `返回 ${execution.resultCount ?? 0} 条网页结果`
        : execution.error?.detail,
      resultCount: execution.resultCount,
      sourceCount: execution.resultCount,
    })),
    followMode: 'auto',
    sources: sources.map((source, index) => ({
      id: `R${index + 1}`,
      title: source.title,
      domain: source.domain,
      url: source.url,
      excerpt: source.snippet,
      time: new Date(source.retrievedAt).toLocaleString('zh-CN'),
      provider: source.provider,
      kind: 'clue',
    })),
    open: false,
  };
}

// 将实时工具生命周期事件增量投影到当前 Workbench 状态。
function applyToolEvent(
  current: WorkbenchState | undefined,
  event: ToolStreamEvent,
  open: boolean,
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
    const tool: ToolCallView = {
      toolCallId: event.toolCallId,
      runId: event.messageId,
      stepId: event.toolCallId,
      toolName: event.toolName,
      title: `搜索：${event.input.query}`,
      detail: '正在搜索公开网页',
      status: 'running',
      elapsed: '进行中',
      inputSummary: event.input.query,
    };
    const executions = base.executions.some((item) => item.toolCallId === event.toolCallId)
      ? base.executions
      : [...base.executions, tool];
    return {
      ...base,
      open,
      activityStatus: 'running',
      executions,
      focusTarget: { kind: 'tool_call', runId: event.messageId, stepId: event.toolCallId, toolCallId: event.toolCallId },
    };
  }

  const completedEvent = event.type === 'tool.completed' ? event : undefined;
  const failedEvent = event.type === 'tool.failed' ? event : undefined;
  const cancelledEvent = event.type === 'tool.cancelled' ? event : undefined;
  const status = completedEvent ? 'completed' as const : cancelledEvent ? 'cancelled' as const : 'failed' as const;
  const executions = base.executions.map((tool) => tool.toolCallId === event.toolCallId
    ? {
        ...tool,
        status,
        detail: completedEvent ? '公开网页检索已完成' : cancelledEvent?.detail ?? failedEvent?.detail ?? '工具执行失败',
        elapsed: formatToolDuration(event.durationMs),
        outputSummary: completedEvent
          ? `返回 ${completedEvent.result.results.length} 条网页结果`
          : cancelledEvent?.detail ?? failedEvent?.detail,
        resultCount: completedEvent?.result.results.length,
        sourceCount: completedEvent?.result.results.length,
      }
    : tool);
  const sourceMap = new Map(base.sources.map((source) => [source.url, source]));
  if (event.type === 'tool.completed') {
    for (const source of event.result.results) {
      if (!sourceMap.has(source.url)) {
        sourceMap.set(source.url, {
          id: `R${sourceMap.size + 1}`,
          title: source.title,
          domain: source.domain,
          url: source.url,
          excerpt: source.snippet,
          time: new Date(event.completedAt).toLocaleString('zh-CN'),
          provider: event.result.provider,
          kind: 'clue',
        });
      }
    }
  }
  const sources = [...sourceMap.values()];
  return {
    ...base,
    open,
    activityStatus: cancelledEvent ? 'cancelled' : base.activityStatus,
    subtitle: `${executions.length} 次调用 · ${sources.length} 个检索线索`,
    activeView: event.type === 'tool.completed' && sources.length ? 'sources' : base.activeView,
    executions,
    sources,
  };
}

// 将持久化消息转换为 Conversation 可直接渲染的项目。
function toConversationItem(message: PersistedMessage): ConversationItem {
  if (message.role === 'user') return {
    id: message.id,
    kind: 'user',
    content: message.content,
    createdAt: message.createdAt,
  };
  const metadata = assistantAgentMetadataSchema.safeParse(message.metadata);
  const blocks: AssistantContentBlock[] = metadata.success && metadata.data.blocks?.length
    ? cloneAssistantBlocks(metadata.data.blocks)
    : [{ id: `${message.id}-text-1`, type: 'text', content: message.content }];
  return {
    id: message.id,
    kind: 'assistant',
    blocks,
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

// 管理生产页面的持久化会话、独立缓存和后台流。
function PersistentAgentApp() {
  // 会话列表与 sessionStates 分离：前者驱动 Sidebar，后者缓存各会话独立 UI 投影。
  const [serviceState, setServiceState] = useState<ServiceState>('checking');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionStates, setSessionStates] = useState<Record<string, AgentUiState>>({});
  // pendingSessions 允许不同会话并行生成，同时限制同一会话重复提交。
  const [pendingSessions, setPendingSessions] = useState<Record<string, boolean>>({});
  const [draftPending, setDraftPending] = useState(false);
  const [draftState, setDraftState] = useState<AgentUiState>(() => makeFixture('empty'));
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // ref 为异步 SSE 回调提供最新值，避免闭包读取过期 React state。
  const selectedSessionIdRef = useRef<string | null>(null);
  const pendingSessionsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    pendingSessionsRef.current = pendingSessions;
  }, [pendingSessions]);

  // 同步更新 pending ref 和 React 状态，避免异步详情请求读到旧值。
  function setSessionPending(sessionId: string, pending: boolean): void {
    const next = { ...pendingSessionsRef.current, [sessionId]: pending };
    pendingSessionsRef.current = next;
    setPendingSessions(next);
  }

  // 首次进入时检查服务、加载列表并恢复 URL 指定或最近会话。
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([getReadiness(controller.signal), listSessions(controller.signal)])
      .then(([, loadedSessions]) => {
        setServiceState('ready');
        setSessions(loadedSessions);
        const requestedId = new URLSearchParams(window.location.search).get('session');
        const target = loadedSessions.find((session) => session.id === requestedId) ?? loadedSessions[0];
        if (target) {
          setSelectedSessionId(target.id);
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
  }, []);

  // 从 API 覆盖指定会话缓存，以数据库结果作为最终事实。
  async function loadSessionDetail(sessionId: string): Promise<void> {
    if (pendingSessionsRef.current[sessionId]) return;
    try {
      const { session } = await getSession(sessionId);
      if (pendingSessionsRef.current[sessionId]) return;
      setSessionStates((current) => {
        const conversation = session.messages.map(toConversationItem);
        const activeWorkbench = current[sessionId]?.workbench;
        const restoredItem = activeWorkbench
          ? conversation.find((item) => item.kind === 'assistant' && item.id === activeWorkbench.runId)
          : undefined;
        const restoredWorkbench = restoredItem?.kind === 'assistant' ? restoredItem.workbench : undefined;
        return {
          ...current,
          [sessionId]: {
            label: session.title,
            subtitle: '',
            conversation,
            ...(restoredWorkbench
              ? { workbench: { ...restoredWorkbench, open: activeWorkbench?.open ?? false } }
              : {}),
            autoOpenSuppressedRunIds: current[sessionId]?.autoOpenSuppressedRunIds,
          },
        };
      });
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

  // 切换会话时先展示缓存，再异步以服务端详情覆盖。
  function selectSession(sessionId: string): void {
    setSelectedSessionId(sessionId);
    setPrompt('');
    setError(null);
    updateSessionUrl(sessionId);
    setMobileNavOpen(false);
    void loadSessionDetail(sessionId);
  }

  // 新建按钮只进入本地空白草稿，不提前写数据库。
  function startDraft(): void {
    setSelectedSessionId(null);
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
      const historicalItem = state.conversation.find((item) => item.kind === 'assistant' && item.id === target.runId);
      const historical = historicalItem?.kind === 'assistant' ? historicalItem.workbench : undefined;
      const workbench = state.workbench?.runId === target.runId ? state.workbench : historical;
      if (!workbench) return current;
      const activeView: WorkspaceView = target.kind === 'source' ? 'sources' : target.kind === 'report' ? 'report' : 'activity';
      return {
        ...current,
        [sessionId]: {
          ...state,
          workbench: { ...workbench, open: true, activeView, focusTarget: target, followMode: 'pinned' },
        },
      };
    });
  }

  // 删除确认后的会话，并按最新列表决定恢复落点。
  async function removeSession(sessionId: string): Promise<void> {
    const target = sessions.find((session) => session.id === sessionId);
    if (!window.confirm(`确定删除会话“${target?.title ?? '未命名会话'}”吗？`)) return;
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
      setSessions((current) => sortSessionSummaries(
        current.map((session) => session.id === sessionId ? updated : session),
      ));
      if (input.title !== undefined) {
        setSessionStates((current) => current[sessionId]
          ? { ...current, [sessionId]: { ...current[sessionId], label: updated.title } }
          : current);
      }
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    }
  }

  // 提交消息；空白草稿先建会话，之后所有流只更新目标 sessionId。
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
    let sessionId = currentId;
    let isFirstTurn = !sessionId;
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
        setSelectedSessionId(created.id);
        selectedSessionIdRef.current = created.id;
        updateSessionUrl(created.id, true);
      } else {
        const existing = sessionStates[sessionId]?.conversation ?? [];
        isFirstTurn = !existing.some((item) => item.kind === 'assistant');
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

      const completed = await requestChatStream(targetId, task, (deltaEvent) => {
        setSessionStates((current) => {
          const target = current[targetId];
          if (!target) return current;
          return {
            ...current,
            [targetId]: {
              ...target,
              conversation: target.conversation.map((item) =>
                item.kind === 'assistant' && item.id === localAssistantId
                  ? {
                      ...item,
                      blocks: appendTextDelta(item.blocks, deltaEvent),
                    }
                  : item,
              ),
            },
          };
        });
      }, (toolEvent) => {
        setSessionStates((current) => {
          const target = current[targetId];
          if (!target) return current;
          const suppressed = target.autoOpenSuppressedRunIds?.includes(toolEvent.messageId) ?? false;
          const existing = target.workbench?.runId === toolEvent.messageId ? target.workbench : undefined;
          const open = existing ? existing.open : !suppressed;
          const workbench = applyToolEvent(existing, toolEvent, open);
          return {
            ...current,
            [targetId]: {
              ...target,
              workbench,
              conversation: target.conversation.map((item) =>
                item.kind === 'assistant' && item.id === localAssistantId
              ? { ...item, blocks: applyToolActivityEvent(item.blocks, toolEvent), workbench }
                  : item,
              ),
            },
          };
        });
      });
      setSessionPending(targetId, false);
      setSessionStates((current) => {
        const target = current[targetId];
        if (!target) return current;
        const completedWorkbench = target.workbench?.runId === completed.messageId
          ? { ...target.workbench, activityStatus: 'completed' as const }
          : target.workbench;
        return {
          ...current,
          [targetId]: {
            ...target,
            workbench: completedWorkbench,
            conversation: target.conversation.map((item) =>
              item.id === localAssistantId
                ? { ...item, id: completed.messageId, pending: false, workbench: completedWorkbench }
                : item,
            ),
          },
        };
      });
      await loadSessionDetail(targetId);
      try {
        await refreshSessions();
      } catch {
        // 回答已经交付，侧栏刷新失败不回滚消息。
      }
      if (isFirstTurn) {
        try {
          const titleResult = await generateSessionTitle(targetId);
          setSessions((current) =>
            current
              .map((item) => item.id === targetId ? titleResult.session : item)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          );
          setSessionStates((current) => current[targetId]
            ? { ...current, [targetId]: { ...current[targetId], label: titleResult.session.title } }
            : current);
        } catch {
          // 标题生成是非关键后处理，失败时保留临时标题。
        }
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
                item.kind === 'assistant' && item.id === localAssistantId
                  ? {
                      ...item,
                      pending: false,
                      blocks: item.blocks.length ? item.blocks : [{ id: `${localAssistantId}-failed`, type: 'text', content: '本次回答未完成，请稍后重试。' }],
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
      setDraftPending(false);
    }
  }

  // 以下派生状态统一决定当前 Conversation、Composer 和 Workbench 布局。
  const uiState = selectedSessionId
    ? sessionStates[selectedSessionId] ?? {
        label: sessions.find((session) => session.id === selectedSessionId)?.title ?? '加载中…',
        subtitle: '',
        conversation: [],
      }
    : draftState;
  const submitting = selectedSessionId ? Boolean(pendingSessions[selectedSessionId]) : draftPending;
  const hasWorkbench = Boolean(uiState.workbench?.open);

  return (
    <div className="app-shell">
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
        onDelete={(sessionId) => void removeSession(sessionId)}
        onRename={(sessionId, title) => modifySession(sessionId, { title })}
        onTogglePin={(sessionId, isPinned) => void modifySession(sessionId, { isPinned })}
      />
      {mobileNavOpen ? (
        <button className="mobile-backdrop" type="button" aria-label="关闭会话栏" onClick={() => setMobileNavOpen(false)} />
      ) : null}
      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button open-mobile-nav" type="button" aria-label="打开会话栏" title="打开会话栏" onClick={() => setMobileNavOpen(true)}>
            <Menu size={18} />
          </button>
          <div className="task-title"><span className="task-title__label">{uiState.label}</span></div>
        </header>
        <div className={`workbench-grid ${hasWorkbench ? 'has-workbench' : 'without-workbench'}`}>
          <Conversation
            state={uiState}
            error={error}
            onDismissError={() => setError(null)}
            onFocusWorkbench={focusCurrentWorkbench}
            prompt={prompt}
            submitting={submitting}
            serviceState={serviceState}
            composerMode="new-run"
            onPromptChange={setPrompt}
            onSubmit={(event) => void handleSubmit(event)}
          />
          {uiState.workbench ? (
            <WorkbenchShell
              state={uiState.workbench}
              onViewChange={(activeView) => {
                if (!selectedSessionId) return;
                setSessionStates((current) => current[selectedSessionId]?.workbench
                  ? {
                      ...current,
                      [selectedSessionId]: {
                        ...current[selectedSessionId],
                        workbench: { ...current[selectedSessionId].workbench!, activeView },
                      },
                    }
                  : current);
              }}
              onExecutionSelect={(tool) => {
                if (!selectedSessionId) return;
                setSessionStates((current) => current[selectedSessionId]?.workbench
                  ? {
                      ...current,
                      [selectedSessionId]: {
                        ...current[selectedSessionId],
                        workbench: {
                          ...current[selectedSessionId].workbench!,
                          followMode: 'pinned',
                          focusTarget: { kind: 'tool_call', runId: tool.runId, stepId: tool.stepId, toolCallId: tool.toolCallId },
                        },
                      },
                    }
                  : current);
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
                      autoOpenSuppressedRunIds: [...new Set([...(state.autoOpenSuppressedRunIds ?? []), state.workbench.runId])],
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
export function AppShell({ previewState }: { previewState?: AgentUiState }) {
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
        label: current.conversation.length ? current.label : task.slice(0, AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength),
        conversation: [...current.conversation,
          { id: `u-${now}`, kind: 'user', content: task, createdAt: new Date().toISOString() },
          { id: `a-${now}`, kind: 'assistant', blocks: [{ id: `a-${now}-text-1`, type: 'text', content: '这是开发预览中的本地回复。' }] },
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
    <div className="app-shell">
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
      <main className="main-shell">
        <header className="topbar">
          <button
            className="icon-button open-mobile-nav"
            type="button"
            aria-label="打开会话栏"
            title="打开会话栏"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="task-title">
            <span className="task-title__label">{uiState.label}</span>
          {uiState.subtitle ? <span className="task-title__meta">{uiState.subtitle}</span> : null}
        </div>
        </header>
        <div className={`workbench-grid ${hasWorkbench ? 'has-workbench' : 'without-workbench'}`}>
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
      if (event instanceof PointerEvent && !(event.target as Element).closest('.session-actions, .session-menu')) {
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
  function toggleSessionMenu(
    sessionId: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void {
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
    if (!editingSession || !title || title.length > AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength || title === editingSession.title) return;
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
    <aside className={`session-sidebar ${mobileNavOpen ? 'session-sidebar--open' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true">
          H
        </div>
        <div>
          <strong>Harness</strong>
          <span>Agent Workbench</span>
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
      <div className="sidebar-heading">
        <span>会话</span>
        <button className="icon-button" type="button" aria-label="新建会话" title="新建会话" onClick={onNew}>
          <Plus size={18} />
        </button>
      </div>
      <div className="session-list">
        {sessions && selectedSessionId === null ? (
          <div className="session-row">
            <button className="session-item is-active" type="button">
              <strong>{AGENT_UI_COPY.defaultSessionTitle}</strong>
            </button>
          </div>
        ) : null}
        {sessions ? sessions.map((session) => (
          <div className="session-row" key={session.id}>
            <button
              className={`session-item ${selectedSessionId === session.id ? 'is-active' : ''}`}
              type="button"
              onClick={() => onSelect?.(session.id)}
              aria-label={pendingSessions?.[session.id] ? `${session.title}，正在生成回复` : session.title}
            >
              <strong>{session.title}</strong>
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
        )) : (
          <>
            <button className="session-item is-active" type="button">
              <strong>{AGENT_UI_COPY.defaultSessionTitle}</strong>
            </button>
            <div className="sidebar-section"><span>最近使用</span></div>
            <div className="sessions-empty">
              <span>暂无其他会话</span>
            </div>
          </>
        )}
        {sessions && sessions.length === 0 && selectedSessionId !== null ? (
          <div className="sessions-empty"><span>暂无会话</span></div>
        ) : null}
      </div>
      {serviceLabel ? (
        <div className="sidebar-footer">
          <span className={`status-dot status-dot--${serviceState}`} aria-hidden="true" />
          <span>{serviceLabel}</span>
          <span className="local-badge">本地</span>
        </div>
      ) : null}
    </aside>
    {menuSessionId && menuAnchor && sessions ? (() => {
      const session = sessions.find((item) => item.id === menuSessionId);
      return session ? createPortal(
        <div
          className="session-menu"
          role="menu"
          aria-label={`${session.title} 会话操作`}
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
        >
          <button type="button" role="menuitem" onClick={() => openRename(session)}>
            <Pencil size={15} /><span>重命名</span>
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
            <Trash2 size={15} /><span>删除</span>
          </button>
        </div>,
        document.body,
      ) : null;
    })() : null}
    {editingSession ? createPortal(
      <div className="rename-dialog-backdrop" role="presentation" onMouseDown={() => !savingTitle && setEditingSession(null)}>
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
            <button className="icon-button" type="button" aria-label="关闭" onClick={() => setEditingSession(null)} disabled={savingTitle}>
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
            <button className="secondary-button" type="button" onClick={() => setEditingSession(null)} disabled={savingTitle}>取消</button>
            <button className="primary-button" type="submit" disabled={savingTitle || !editTitle.trim() || editTitle.trim() === editingSession.title}>
              {savingTitle ? '保存中…' : '确认'}
            </button>
          </div>
        </form>
      </div>,
      document.body,
    ) : null}
    </>
  );
}
