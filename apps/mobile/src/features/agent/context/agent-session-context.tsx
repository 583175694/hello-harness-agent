import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';
import type {
  ArtifactRef,
  FileRef,
  PendingUserInputView,
  PublicModelConfig,
  ReasoningEffort,
  RunSnapshot,
  RunStreamEvent,
  SessionSummary,
  ToolApprovalDecision,
} from '@harness/agent-protocol';
import {
  mergePendingSteerState,
  optimisticRevisionAttachments,
  preferRicherAssistant,
  toConversationItem,
  uniquePendingInputs,
} from '@harness/agent-projection';
import {
  applyRunEventToSession,
  applyRunSnapshotToSession,
  groupSessionSummaries,
  workbenchViewFromTarget,
} from '@harness/agent-run-state';
import type {
  AgentUiState,
  ConversationItem,
  WorkbenchFocusTarget,
} from '@harness/agent-ui-types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getAgentClient, resetAgentClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { getContentFontSize, getLastSessionId, setLastSessionId } from '@/lib/storage';
import { useAppStateRunLifecycle } from '../hooks/useAppStateRunLifecycle';
import { useRunObserver } from '../hooks/useRunObserver';
import { makeProvisionalTitle, sortSessionSummaries } from '../lib/session-utils';

export type ServiceState = 'checking' | 'ready' | 'unavailable';
export type ConnectionState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline';
export type PrimaryPanel = 'conversation' | 'workbench';

type AgentSessionContextValue = {
  serviceState: ServiceState;
  connectionState: ConnectionState;
  sessions: SessionSummary[];
  sessionGroups: ReturnType<typeof groupSessionSummaries>;
  selectedSessionId: string | null;
  uiState: AgentUiState;
  prompt: string;
  setPrompt: (value: string) => void;
  attachments: FileRef[];
  attachmentUploading: boolean;
  error: string | null;
  dismissError: () => void;
  pendingInputs: PendingUserInputView[];
  models: PublicModelConfig[];
  selectedModel: string;
  setSelectedModel: (id: string) => void;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (value: ReasoningEffort) => void;
  primaryPanel: PrimaryPanel;
  setPrimaryPanel: (panel: PrimaryPanel) => void;
  sessionDrawerOpen: boolean;
  setSessionDrawerOpen: (open: boolean) => void;
  submitting: boolean;
  composerMode: 'new-run' | 'steer' | 'clarification' | 'disabled';
  selectSession: (sessionId: string | null) => void;
  createNewSession: () => void;
  refreshSessions: () => Promise<void>;
  reloadService: () => void;
  submitPrompt: () => Promise<void>;
  cancelActiveRun: () => Promise<void>;
  pauseActiveRun: () => Promise<void>;
  resumeActiveRun: () => Promise<void>;
  respondClarification: (interruptId: string, content: string) => Promise<void>;
  approveTool: (interruptId: string, approved: boolean) => Promise<void>;
  approveToolDecisions: (interruptId: string, decisions: ToolApprovalDecision[]) => Promise<void>;
  promotePending: (inputId: string) => Promise<void>;
  cancelPending: (inputId: string) => Promise<void>;
  sendPending: (inputId: string) => Promise<void>;
  restoreArtifactVersion: (artifact: ArtifactRef) => Promise<void>;
  selectSessionFromDeepLink: (sessionId: string) => void;
  pasteAttachments: (files: File[]) => Promise<void>;
  contentFontSize: number;
  refreshContentFontSize: () => void;
  focusWorkbench: (target: WorkbenchFocusTarget, pinned?: boolean) => void;
  setWorkbenchView: (view: NonNullable<AgentUiState['workbench']>['activeView']) => void;
  closeWorkbench: () => void;
  pickDocument: () => Promise<void>;
  pickImage: () => Promise<void>;
  removeAttachment: (fileId: string) => void;
  retryAttachment: (fileId: string) => Promise<void>;
  beginArtifactRevision: (artifact: ArtifactRef) => void;
  clearRevisionContext: () => void;
  deleteSessionById: (session: SessionSummary) => Promise<void>;
  updateSessionMeta: (
    sessionId: string,
    patch: { title?: string; isPinned?: boolean },
  ) => Promise<void>;
};

const emptyState = (): AgentUiState => ({
  label: '新会话',
  subtitle: '',
  conversation: [],
});

const AgentSessionContext = createContext<AgentSessionContextValue | null>(null);

export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getAgentClient(), []);
  const { observeRun, abortAll, sequencesRef } = useRunObserver(client);

  const [serviceState, setServiceState] = useState<ServiceState>('checking');
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionIdState] = useState<string | null>(null);
  const [sessionStates, setSessionStatesState] = useState<Record<string, AgentUiState>>({});
  const [pendingSessions, setPendingSessions] = useState<Record<string, boolean>>({});
  const [draftPending, setDraftPending] = useState(false);
  const [draftState, setDraftState] = useState<AgentUiState>(emptyState);
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<FileRef[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingInputs, setPendingInputs] = useState<PendingUserInputView[]>([]);
  const [models, setModels] = useState<PublicModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');
  const [primaryPanel, setPrimaryPanel] = useState<PrimaryPanel>('conversation');
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [apiEpoch, setApiEpoch] = useState(0);
  const [contentFontSize, setContentFontSizeState] = useState(getContentFontSize());

  const selectedSessionIdRef = useRef<string | null>(null);
  const pendingSessionsRef = useRef<Record<string, boolean>>({});
  const sessionStatesRef = useRef<Record<string, AgentUiState>>({});
  const pendingInputsRef = useRef<PendingUserInputView[]>([]);
  const loadedSessionDetailsRef = useRef<Set<string>>(new Set());
  const draftSubmissionTokenRef = useRef(0);
  const attachmentCountRef = useRef(0);
  const foregroundResyncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    pendingSessionsRef.current = pendingSessions;
  }, [pendingSessions]);
  useEffect(() => {
    sessionStatesRef.current = sessionStates;
  }, [sessionStates]);
  useEffect(() => {
    pendingInputsRef.current = pendingInputs;
  }, [pendingInputs]);
  useEffect(() => {
    attachmentCountRef.current = attachments.length;
  }, [attachments.length]);

  const setSelectedSession = useCallback((sessionId: string | null) => {
    selectedSessionIdRef.current = sessionId;
    setSelectedSessionIdState(sessionId);
    setLastSessionId(sessionId);
  }, []);

  const setSessionStates = useCallback(
    (update: (current: Record<string, AgentUiState>) => Record<string, AgentUiState>) => {
      const next = update(sessionStatesRef.current);
      sessionStatesRef.current = next;
      setSessionStatesState(next);
    },
    [],
  );

  const setSessionPending = useCallback((sessionId: string, pending: boolean) => {
    const next = { ...pendingSessionsRef.current, [sessionId]: pending };
    pendingSessionsRef.current = next;
    setPendingSessions(next);
  }, []);

  const applyRunSnapshot = useCallback(
    (sessionId: string, snapshot: RunSnapshot) => {
      if (snapshot.lastEventSequence < (sequencesRef.current[snapshot.runId] ?? 0)) return;
      sequencesRef.current[snapshot.runId] = snapshot.lastEventSequence;
      const target = sessionStatesRef.current[sessionId];
      if (!target) return;
      const result = applyRunSnapshotToSession(
        sessionId,
        target,
        snapshot,
        pendingInputsRef.current,
      );
      setPendingInputs(result.pendingInputs);
      setSessionPending(sessionId, result.sessionPending);
      setSessionStates((current) => {
        const prev = current[sessionId];
        const nextState = result.sessionState;
        if (
          prev &&
          !prev.workbench?.open &&
          nextState.workbench?.open &&
          nextState.workbench.focusTarget
        ) {
          setPrimaryPanel('workbench');
        }
        return { ...current, [sessionId]: nextState };
      });
      if (result.errorDetail && selectedSessionIdRef.current === sessionId)
        setError(result.errorDetail);
    },
    [sequencesRef, setSessionPending, setSessionStates],
  );

  const applyRunEvent = useCallback(
    (sessionId: string, event: RunStreamEvent, task = '') => {
      const cursor = sequencesRef.current[event.runId] ?? 0;
      if (event.type === 'run.snapshot') {
        applyRunSnapshot(sessionId, event.payload as RunSnapshot);
        return;
      }
      const target = sessionStatesRef.current[sessionId];
      if (!target) return;
      const result = applyRunEventToSession(
        sessionId,
        target,
        pendingInputsRef.current,
        Boolean(pendingSessionsRef.current[sessionId]),
        event,
        cursor,
        task,
      );
      if (result.duplicate) return;
      if (result.gap) {
        setError('事件流出现缺口，正在重新同步…');
        return;
      }
      sequencesRef.current[event.runId] = result.nextCursor;
      setPendingInputs(result.pendingInputs);
      setSessionPending(sessionId, result.sessionPending);
      setSessionStates((current) => {
        const prev = current[sessionId];
        const nextState = result.sessionState;
        if (
          prev &&
          !prev.workbench?.open &&
          nextState.workbench?.open &&
          nextState.workbench.focusTarget
        ) {
          setPrimaryPanel('workbench');
        }
        return { ...current, [sessionId]: nextState };
      });
      if (result.errorDetail) setError(result.errorDetail);
    },
    [applyRunSnapshot, sequencesRef, setSessionPending, setSessionStates],
  );

  const refreshSessions = useCallback(async () => {
    const loaded = await client.listSessions();
    setSessions(sortSessionSummaries(loaded));
  }, [client]);

  const loadSessionDetail = useCallback(
    async (sessionId: string, force = false) => {
      if (pendingSessionsRef.current[sessionId]) return;
      if (!force && loadedSessionDetailsRef.current.has(sessionId)) return;
      loadedSessionDetailsRef.current.add(sessionId);
      const { session } = await client.getSession(sessionId);
      if (pendingSessionsRef.current[sessionId]) return;
      setPendingInputs(uniquePendingInputs(session.pendingUserInputs));
      setSessionStates((current) => {
        const conversation = mergePendingSteerState(
          session.messages.map(toConversationItem),
          session.pendingUserInputs,
        );
        const existing = current[sessionId]?.conversation ?? [];
        const restored = conversation.map((item) =>
          preferRicherAssistant(
            existing.find((candidate) => candidate.id === item.id),
            item,
          ),
        );
        return {
          ...current,
          [sessionId]: {
            label: session.title,
            subtitle: '',
            conversation: restored,
            workbench: current[sessionId]?.workbench,
            activeRunId: session.activeRun?.runId ?? current[sessionId]?.activeRunId,
            pendingInputs: session.pendingUserInputs,
          },
        };
      });
      if (session.activeRun?.runId) {
        setConnectionState('connecting');
        void observeRun(
          sessionId,
          session.activeRun.runId,
          {
            applySnapshot: (snapshot) => applyRunSnapshot(sessionId, snapshot),
            applyEvent: (event, task) => applyRunEvent(sessionId, event, task),
            onReconnecting: () => setConnectionState('reconnecting'),
            onReconnected: () => setConnectionState('live'),
            onError: (message) => setError(message),
            refreshSessions,
            syncAfterTerminal: async () => undefined,
          },
          '',
          false,
        ).finally(() => setConnectionState('idle'));
      }
    },
    [applyRunEvent, applyRunSnapshot, client, observeRun, refreshSessions, setSessionStates],
  );

  const bootstrap = useCallback(async () => {
    resetAgentClient();
    const api = getAgentClient();
    setServiceState('checking');
    try {
      const [, loadedSessions, config] = await Promise.all([
        api.getReadiness(),
        api.listSessions(),
        api.getPublicAgentConfig(),
      ]);
      setServiceState('ready');
      setSessions(sortSessionSummaries(loadedSessions));
      const selected =
        config.models.find((model) => model.id === config.defaultModel) ?? config.models[0];
      setModels(config.models);
      if (selected) {
        setSelectedModel(selected.id);
        setReasoningEffort(selected.reasoning.default);
      }
      const lastId = getLastSessionId();
      const target =
        loadedSessions.find((s) => s.id === lastId) ?? loadedSessions[0] ?? null;
      if (target) {
        setSelectedSession(target.id);
        await loadSessionDetail(target.id, true);
      }
    } catch (requestError) {
      setServiceState('unavailable');
      setError(getErrorMessage(requestError));
    }
  }, [loadSessionDetail, setSelectedSession]);

  useEffect(() => {
    void bootstrap();
    return () => abortAll();
  }, [apiEpoch, abortAll, bootstrap]);

  useAppStateRunLifecycle({
    onBackground: () => abortAll(),
    onForeground: () => foregroundResyncRef.current?.(),
  });

  useEffect(() => {
    foregroundResyncRef.current = () => {
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId) return;
      void loadSessionDetail(sessionId, true);
    };
  }, [loadSessionDetail]);

  const uiState = useMemo(() => {
    if (!selectedSessionId) return draftState;
    return sessionStates[selectedSessionId] ?? draftState;
  }, [draftState, selectedSessionId, sessionStates]);

  const submitting = selectedSessionId
    ? Boolean(
        pendingSessions[selectedSessionId] || sessionStates[selectedSessionId]?.activeRunId,
      )
    : draftPending;

  const composerMode = useMemo((): AgentSessionContextValue['composerMode'] => {
    if (serviceState !== 'ready') return 'disabled';
    if (uiState.workbench?.activityStatus === 'cancelling') return 'disabled';
    if (uiState.activeInterrupt) return 'clarification';
    if (submitting) return 'steer';
    return 'new-run';
  }, [serviceState, submitting, uiState.activeInterrupt, uiState.workbench?.activityStatus]);

  const selectSession = useCallback(
    (sessionId: string | null) => {
      setSelectedSession(sessionId);
      setSessionDrawerOpen(false);
      if (sessionId) void loadSessionDetail(sessionId);
    },
    [loadSessionDetail, setSelectedSession],
  );

  const createNewSession = useCallback(() => {
    setSelectedSession(null);
    setDraftState(emptyState());
    setPrompt('');
    setAttachments([]);
    setSessionDrawerOpen(false);
  }, [setSelectedSession]);

  const submitPrompt = useCallback(async () => {
    const task = prompt.trim();
    if (!task || serviceState !== 'ready') return;
    const currentId = selectedSessionIdRef.current;
    const runtimeActive = currentId
      ? Boolean(
          pendingSessionsRef.current[currentId] ||
            sessionStatesRef.current[currentId]?.activeRunId,
        )
      : false;
    if (currentId && runtimeActive) {
      setPrompt('');
      setError(null);
      try {
        const result = (await client.submitPendingInput(currentId, task)) as {
          input?: PendingUserInputView;
        };
        if (result.input) {
          setPendingInputs((current) => uniquePendingInputs([...current, result.input!]));
        }
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      }
      return;
    }
    if (currentId ? runtimeActive : draftPending) return;
    if (composerMode === 'disabled') return;
    setPrompt('');
    setError(null);
    const createdAt = new Date().toISOString();
    const localUserId = `local-user-${Date.now()}`;
    const localAssistantId = `local-assistant-${Date.now()}`;
    let assistantMessageId = localAssistantId;
    let sessionId = currentId;
    const draftSubmissionToken = currentId ? undefined : ++draftSubmissionTokenRef.current;
    const optimisticAttachments = optimisticRevisionAttachments(
      attachments,
      uiState.revisionContext,
      uiState.workbench,
    );
    const optimisticUser: ConversationItem = {
      id: localUserId,
      kind: 'user',
      content: task,
      createdAt,
      ...(optimisticAttachments.length ? { attachments: optimisticAttachments } : {}),
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
        const created = await client.createSession(makeProvisionalTitle(task));
        sessionId = created.id;
        setSessions((current) =>
          sortSessionSummaries([created, ...current.filter((item) => item.id !== created.id)]),
        );
        if (draftSubmissionToken === draftSubmissionTokenRef.current) {
          setSelectedSession(created.id);
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
      const run = await client.createRun(
        targetId,
        task,
        selectedModel,
        reasoningEffort,
        attachments.map((item) => item.fileId),
        uiState.revisionContext
          ? { ...uiState.revisionContext, changeSummary: task.slice(0, 500) }
          : undefined,
      );
      setAttachments([]);
      if (uiState.revisionContext) {
        setSessionStates((current) => ({
          ...current,
          [targetId]: { ...current[targetId]!, revisionContext: undefined },
        }));
      }
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
      setConnectionState('connecting');
      await observeRun(
        targetId,
        run.runId,
        {
          applySnapshot: (snapshot) => applyRunSnapshot(targetId, snapshot),
          applyEvent: (event, runTask) => applyRunEvent(targetId, event, runTask),
          onReconnecting: () => setConnectionState('reconnecting'),
          onReconnected: () => setConnectionState('live'),
          onError: (message) => setError(message),
          refreshSessions,
          syncAfterTerminal: async () => undefined,
        },
        task,
        true,
      );
      await refreshSessions();
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
      } else {
        setPrompt(task);
        setDraftState(emptyState());
      }
      setError(getErrorMessage(requestError));
    } finally {
      if (sessionId) setSessionPending(sessionId, false);
      if (
        draftSubmissionToken === undefined ||
        draftSubmissionToken === draftSubmissionTokenRef.current
      ) {
        setDraftPending(false);
      }
      setConnectionState('idle');
    }
  }, [
    applyRunEvent,
    applyRunSnapshot,
    attachments,
    client,
    observeRun,
    prompt,
    reasoningEffort,
    refreshSessions,
    selectedModel,
    serviceState,
    setSelectedSession,
    setSessionPending,
    setSessionStates,
    submitting,
    uiState.revisionContext,
    uiState.workbench,
  ]);

  const cancelActiveRun = useCallback(async () => {
    const sessionId = selectedSessionIdRef.current;
    const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
    if (!sessionId || !runId) return;
    await client.cancelRun(runId);
  }, [client]);

  const pauseActiveRun = useCallback(async () => {
    const sessionId = selectedSessionIdRef.current;
    const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
    if (!runId) return;
    await client.controlRun(runId, { type: 'pause' });
  }, [client]);

  const resumeActiveRun = useCallback(async () => {
    const sessionId = selectedSessionIdRef.current;
    const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
    if (!runId) return;
    await client.controlRun(runId, { type: 'resume' });
  }, [client]);

  const respondClarification = useCallback(
    async (interruptId: string, answer: string) => {
      const sessionId = selectedSessionIdRef.current;
      const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
      if (!sessionId || !runId) return;
      try {
        const result = await client.controlRun(runId, {
          type: 'respond',
          interruptId,
          payload: { answer },
        });
        applyRunSnapshot(sessionId, result.snapshot);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
        try {
          applyRunSnapshot(sessionId, await client.getRun(runId));
        } catch {
          // keep original error
        }
      }
    },
    [applyRunSnapshot, client],
  );

  const approveToolDecisions = useCallback(
    async (interruptId: string, decisions: ToolApprovalDecision[]) => {
      const sessionId = selectedSessionIdRef.current;
      const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
      if (!sessionId || !runId) return;
      const allReject = decisions.every((item) => item.decision === 'reject');
      try {
        const result = await client.controlRun(runId, {
          type: allReject ? 'reject' : 'approve',
          interruptId,
          decisions,
        });
        applyRunSnapshot(sessionId, result.snapshot);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
        try {
          applyRunSnapshot(sessionId, await client.getRun(runId));
        } catch {
          // keep original error
        }
      }
    },
    [applyRunSnapshot, client],
  );

  const approveTool = useCallback(
    async (interruptId: string, approved: boolean) => {
      const sessionId = selectedSessionIdRef.current;
      const runId = sessionId ? sessionStatesRef.current[sessionId]?.activeRunId : undefined;
      if (!sessionId || !runId) return;
      const interrupt = uiState.activeInterrupt;
      const decisions =
        interrupt?.kind === 'tool_approval'
          ? interrupt.payload.items.map((item) => ({
              itemId: item.itemId,
              toolCallId: item.toolCallId,
              argumentsHash: item.argumentsHash,
              decision: approved ? ('approve' as const) : ('reject' as const),
            }))
          : [];
      await approveToolDecisions(interruptId, decisions);
    },
    [approveToolDecisions, uiState.activeInterrupt],
  );

  const promotePending = useCallback(
    async (inputId: string) => {
      await client.promotePendingInput(inputId);
      const sessionId = selectedSessionIdRef.current;
      if (sessionId) await loadSessionDetail(sessionId, true);
    },
    [client, loadSessionDetail],
  );

  const cancelPending = useCallback(
    async (inputId: string) => {
      await client.cancelPendingInput(inputId);
      setPendingInputs((current) => current.filter((item) => item.id !== inputId));
    },
    [client],
  );

  const sendPending = useCallback(
    async (inputId: string) => {
      const run = await client.sendPendingInput(inputId);
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId) return;
      setPendingInputs((current) => current.filter((item) => item.id !== inputId));
      setSessionPending(sessionId, true);
      setConnectionState('connecting');
      await observeRun(
        sessionId,
        run.runId,
        {
          applySnapshot: (snapshot) => applyRunSnapshot(sessionId, snapshot),
          applyEvent: (event, runTask) => applyRunEvent(sessionId, event, runTask),
          onReconnecting: () => setConnectionState('reconnecting'),
          onReconnected: () => setConnectionState('live'),
          onError: (message) => setError(message),
          refreshSessions,
          syncAfterTerminal: async () => undefined,
        },
        '',
        true,
      );
      setSessionPending(sessionId, false);
      setConnectionState('idle');
    },
    [
      applyRunEvent,
      applyRunSnapshot,
      client,
      observeRun,
      refreshSessions,
      setSessionPending,
    ],
  );

  const restoreArtifactVersion = useCallback(
    async (artifact: ArtifactRef) => {
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId || !artifact.seriesId) return;
      const expectedCurrentArtifactId = sessionStatesRef.current[
        sessionId
      ]?.workbench?.artifactSeries?.find((series) => series.seriesId === artifact.seriesId)
        ?.currentArtifactId;
      if (!expectedCurrentArtifactId) return;
      await client.restoreArtifact(artifact.artifactId, expectedCurrentArtifactId);
      await loadSessionDetail(sessionId, true);
      await refreshSessions();
    },
    [client, loadSessionDetail, refreshSessions],
  );

  const selectSessionFromDeepLink = useCallback(
    (sessionId: string) => {
      selectSession(sessionId);
    },
    [selectSession],
  );

  const uploadAttachmentFile = useCallback(
    async (sessionId: string, file: File) => {
      if (attachmentCountRef.current >= AGENT_PROTOCOL_LIMITS.sessionImageAttachmentsMax) return;
      setAttachmentUploading(true);
      try {
        let uploaded = await client.uploadFile(sessionId, file);
        setAttachments((current) => [...current, uploaded]);
        for (let attempt = 0; attempt < 140; attempt += 1) {
          if (uploaded.status !== 'processing') break;
          await new Promise((resolve) => setTimeout(resolve, 250));
          uploaded = await client.getFile(uploaded.fileId);
          setAttachments((current) =>
            current.map((item) => (item.fileId === uploaded.fileId ? uploaded : item)),
          );
        }
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        setAttachmentUploading(false);
      }
    },
    [client],
  );

  const focusWorkbench = useCallback(
    (target: WorkbenchFocusTarget, pinned = true) => {
      setPrimaryPanel('workbench');
      setSessionStates((current) => {
        const sessionId = selectedSessionIdRef.current;
        if (!sessionId) return current;
        const wb = current[sessionId]?.workbench;
        if (!wb || wb.runId !== target.runId) return current;
        return {
          ...current,
          [sessionId]: {
            ...current[sessionId]!,
            workbench: {
              ...wb,
              open: true,
              activeView: workbenchViewFromTarget(target.kind),
              focusTarget: target,
              followMode: pinned ? 'pinned' : 'auto',
            },
          },
        };
      });
    },
    [setSessionStates],
  );

  const setWorkbenchView = useCallback(
    (view: NonNullable<AgentUiState['workbench']>['activeView']) => {
      setSessionStates((current) => {
        const sessionId = selectedSessionIdRef.current;
        if (!sessionId || !current[sessionId]?.workbench) return current;
        return {
          ...current,
          [sessionId]: {
            ...current[sessionId]!,
            workbench: { ...current[sessionId]!.workbench!, activeView: view },
          },
        };
      });
    },
    [setSessionStates],
  );

  const closeWorkbench = useCallback(() => {
    setSessionStates((current) => {
      const sessionId = selectedSessionIdRef.current;
      const wb = sessionId ? current[sessionId]?.workbench : undefined;
      if (!sessionId || !wb) return current;
      return {
        ...current,
        [sessionId]: {
          ...current[sessionId]!,
          autoOpenSuppressedRunIds: [
            ...new Set([...(current[sessionId]?.autoOpenSuppressedRunIds ?? []), wb.runId]),
          ],
          workbench: { ...wb, open: false },
        },
      };
    });
    setPrimaryPanel('conversation');
  }, [setSessionStates]);

  const ensureUploadSessionId = useCallback(async (): Promise<string | null> => {
    let sessionId = selectedSessionIdRef.current;
    if (sessionId) return sessionId;
    const created = await client.createSession('附件上传');
    sessionId = created.id;
    setSessions((current) =>
      sortSessionSummaries([created, ...current.filter((item) => item.id !== created.id)]),
    );
    setSelectedSession(created.id);
    setSessionStates((current) => ({
      ...current,
      [created.id]: { label: created.title, subtitle: '', conversation: [] },
    }));
    return sessionId;
  }, [client, setSelectedSession, setSessionStates]);

  const pasteAttachments = useCallback(
    async (files: File[]) => {
      const sessionId = await ensureUploadSessionId();
      if (!sessionId) return;
      for (const file of files) {
        await uploadAttachmentFile(sessionId, file);
      }
    },
    [ensureUploadSessionId, uploadAttachmentFile],
  );

  const pickDocument = useCallback(async () => {
    const sessionId = await ensureUploadSessionId();
    if (!sessionId) return;
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (attachmentCountRef.current >= AGENT_PROTOCOL_LIMITS.sessionImageAttachmentsMax) return;
    const file = {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType ?? 'application/octet-stream',
    } as unknown as File;
    await uploadAttachmentFile(sessionId, file);
  }, [ensureUploadSessionId, uploadAttachmentFile]);

  const pickImage = useCallback(async () => {
    const sessionId = await ensureUploadSessionId();
    if (!sessionId) return;
    const ImagePicker = await import('expo-image-picker');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (attachmentCountRef.current >= AGENT_PROTOCOL_LIMITS.sessionImageAttachmentsMax) return;
    const file = {
      uri: asset.uri,
      name: asset.fileName ?? `image-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    } as unknown as File;
    await uploadAttachmentFile(sessionId, file);
  }, [ensureUploadSessionId, uploadAttachmentFile]);

  const removeAttachment = useCallback((fileId: string) => {
    setAttachments((current) => current.filter((item) => item.fileId !== fileId));
  }, []);

  const retryAttachment = useCallback(
    async (fileId: string) => {
      try {
        let retried = await client.retryFile(fileId);
        setAttachments((current) => current.map((item) => (item.fileId === fileId ? retried : item)));
        for (let attempt = 0; attempt < 140; attempt += 1) {
          if (retried.status !== 'processing') break;
          await new Promise((resolve) => setTimeout(resolve, 250));
          retried = await client.getFile(fileId);
          setAttachments((current) =>
            current.map((item) => (item.fileId === fileId ? retried : item)),
          );
        }
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      }
    },
    [client],
  );

  const beginArtifactRevision = useCallback(
    (artifact: ArtifactRef) => {
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId || !artifact.seriesId) return;
      const expectedCurrentArtifactId = sessionStatesRef.current[
        sessionId
      ]?.workbench?.artifactSeries?.find((series) => series.seriesId === artifact.seriesId)
        ?.currentArtifactId;
      if (!expectedCurrentArtifactId) return;
      setSessionStates((current) => ({
        ...current,
        [sessionId]: {
          ...current[sessionId]!,
          revisionContext: {
            seriesId: artifact.seriesId!,
            baseArtifactId: artifact.artifactId,
            expectedCurrentArtifactId,
          },
        },
      }));
      setPrimaryPanel('conversation');
    },
    [setSessionStates],
  );

  const clearRevisionContext = useCallback(() => {
    const sessionId = selectedSessionIdRef.current;
    if (!sessionId) return;
    setSessionStates((current) => ({
      ...current,
      [sessionId]: { ...current[sessionId]!, revisionContext: undefined },
    }));
  }, [setSessionStates]);

  const deleteSessionById = useCallback(
    async (session: SessionSummary) => {
      await client.deleteSession(session.id);
      loadedSessionDetailsRef.current.delete(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      if (selectedSessionIdRef.current === session.id) createNewSession();
    },
    [client, createNewSession],
  );

  const updateSessionMeta = useCallback(
    async (sessionId: string, patch: { title?: string; isPinned?: boolean }) => {
      const updated = await client.updateSession(sessionId, patch);
      setSessions((current) =>
        sortSessionSummaries(
          current.map((item) => (item.id === sessionId ? { ...item, ...updated } : item)),
        ),
      );
    },
    [client],
  );

  const reloadService = useCallback(() => {
    setApiEpoch((value) => value + 1);
  }, []);

  const refreshContentFontSize = useCallback(() => {
    setContentFontSizeState(getContentFontSize());
  }, []);

  const value: AgentSessionContextValue = {
    serviceState,
    connectionState,
    sessions,
    sessionGroups: groupSessionSummaries(sessions),
    selectedSessionId,
    uiState,
    prompt,
    setPrompt,
    attachments,
    attachmentUploading,
    error,
    dismissError: () => setError(null),
    pendingInputs,
    models,
    selectedModel,
    setSelectedModel,
    reasoningEffort,
    setReasoningEffort,
    primaryPanel,
    setPrimaryPanel,
    sessionDrawerOpen,
    setSessionDrawerOpen,
    submitting,
    composerMode,
    selectSession,
    createNewSession,
    refreshSessions,
    reloadService,
    submitPrompt,
    cancelActiveRun,
    pauseActiveRun,
    resumeActiveRun,
    respondClarification,
    approveTool,
    approveToolDecisions,
    promotePending,
    cancelPending,
    sendPending,
    restoreArtifactVersion,
    selectSessionFromDeepLink,
    pasteAttachments,
    contentFontSize,
    refreshContentFontSize,
    focusWorkbench,
    setWorkbenchView,
    closeWorkbench,
    pickDocument,
    pickImage,
    removeAttachment,
    retryAttachment,
    beginArtifactRevision,
    clearRevisionContext,
    deleteSessionById,
    updateSessionMeta,
  };

  return (
    <AgentSessionContext.Provider value={value}>{children}</AgentSessionContext.Provider>
  );
}

export function useAgentSession(): AgentSessionContextValue {
  const ctx = useContext(AgentSessionContext);
  if (!ctx) throw new Error('useAgentSession must be used within AgentSessionProvider');
  return ctx;
}
