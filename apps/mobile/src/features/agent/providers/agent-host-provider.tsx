import type { AgentClient } from '@harness/agent-client';
import type {
  PendingInterruptSnapshot,
  ReasoningEffort,
  SessionDetail,
  SessionSummary,
  UpdateSessionRequest,
} from '@harness/agent-protocol';
import type { ArtifactRef } from '@harness/agent-protocol';
import type { WorkbenchState } from '@harness/agent-ui-types';
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

import { ApiProblem } from '@harness/agent-client';

import { createMobileAgentClientForBaseUrl, resolveMobileApiBaseUrl } from '@/lib/agent-client';
import { useMobileAuth } from '@/providers/mobile-auth-provider';
import { bindRunNotificationDeepLink } from '@/lib/run-local-notifications';
import { saveSelectedSessionId } from '@/lib/storage';
import { useAppPreferences } from '@/providers/app-preferences-provider';

import type { ConnectionState } from '../components/connection-pill';
import type { ModelFixture } from '../components/composer-model-menu';
import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import {
  useAgentHostComposerSnapshot,
  useAgentHostConnectionState,
  useAgentHostConversation,
  useAgentHostRunUiAllSlices,
  useAgentHostWorkbenchSnapshot,
} from '../hooks/use-agent-run-ui-slices';
import { useAgentHostRun } from '../hooks/use-agent-host-run';
import type { ComposerSubmitPayload } from '../model/composer-submit.types';
import { createAgentRunUiStore } from '../model/agent-run-ui-store';
import type { MobileServiceState } from '../model/mobile-chrome.types';
import type { SessionComposerBlock } from '../lib/session-composer-block';
import { AgentRunUiStoreContext } from './agent-run-ui-store-context';

export type AgentHostContextValue = {
  client: AgentClient;
  apiBaseUrl: string;
  serviceState: MobileServiceState;
  sessions: SessionSummary[];
  sessionsLoading: boolean;
  selectedSessionId: string | null;
  sessionDetail: SessionDetail | null;
  sessionDetailLoading: boolean;
  conversation: MobileConversationItem[];
  connectionState: ConnectionState;
  runSubmitting: boolean;
  defaultModelId: string | null;
  defaultReasoningEffort: ReasoningEffort;
  composerModels: ModelFixture[];
  composerPlan?: { step: string; status: 'pending' | 'in_progress' | 'completed' }[];
  composerPlanExplanation?: string;
  followUpItems: { id: string; content: string }[];
  followUpSubmittingId: string | null;
  composerRevisionSeed: string | null;
  composerBlock: SessionComposerBlock | null;
  dismissComposerBlock: () => void;
  activeInterrupt: PendingInterruptSnapshot | null;
  hitlSubmitting: boolean;
  workbench?: WorkbenchState;
  workbenchReportId?: string;
  workbenchCount: number;
  hasDeliverables: boolean;
  activityEmphasis: 'default' | 'sources';
  activeRunId: string | null;
  submitRun: (payload: ComposerSubmitPayload) => Promise<void>;
  sendFollowUp: (inputId: string) => Promise<void>;
  cancelFollowUp: (inputId: string) => Promise<void>;
  beginArtifactRevision: (artifact: ArtifactRef) => void;
  respondClarification: (answer: string) => Promise<void>;
  respondToolApproval: (approve: boolean) => Promise<void>;
  pauseActiveRun: () => Promise<void>;
  resumeActiveRun: () => Promise<void>;
  restoreArtifactVersion: (artifact: ArtifactRef) => Promise<void>;
  cancelActiveRun: () => Promise<void>;
  refreshReadiness: () => Promise<boolean>;
  refreshSessions: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  /** 对齐 Web `startDraft`：本地空白草稿，不调用 createSession API。已在草稿态时返回 false。 */
  beginNewSession: () => Promise<boolean>;
  createSession: (title?: string) => Promise<SessionSummary | null>;
  updateSession: (sessionId: string, input: UpdateSessionRequest) => Promise<SessionSummary | null>;
  deleteSession: (sessionId: string) => Promise<boolean>;
};

type AgentHostSessionContextValue = Omit<
  AgentHostContextValue,
  | 'conversation'
  | 'connectionState'
  | 'runSubmitting'
  | 'defaultModelId'
  | 'defaultReasoningEffort'
  | 'composerModels'
  | 'composerPlan'
  | 'composerPlanExplanation'
  | 'followUpItems'
  | 'followUpSubmittingId'
  | 'composerRevisionSeed'
  | 'composerBlock'
  | 'activeInterrupt'
  | 'hitlSubmitting'
  | 'workbench'
  | 'workbenchReportId'
  | 'workbenchCount'
  | 'hasDeliverables'
  | 'activityEmphasis'
  | 'activeRunId'
>;

const AgentHostSessionContext = createContext<AgentHostSessionContextValue | null>(null);

export function AgentHostProvider({ children }: { children: ReactNode }) {
  const { preferences, hydrated } = useAppPreferences();
  const { authEpoch } = useMobileAuth();
  const resolvedBaseUrl = resolveMobileApiBaseUrl(preferences.apiBaseUrl);
  const runUiStore = useMemo(() => createAgentRunUiStore(), []);

  const client = useMemo(
    () => createMobileAgentClientForBaseUrl(preferences.apiBaseUrl),
    [preferences.apiBaseUrl],
  );

  const [serviceState, setServiceState] = useState<MobileServiceState>('checking');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);

  const readinessAbortRef = useRef<AbortController | null>(null);
  const sessionsAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  const ensureSessionSelected = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    void saveSelectedSessionId(sessionId);
  }, []);

  const refreshReadiness = useCallback(async (): Promise<boolean> => {
    readinessAbortRef.current?.abort();
    const controller = new AbortController();
    readinessAbortRef.current = controller;
    setServiceState('checking');
    try {
      const status = await client.getReadiness(controller.signal);
      if (controller.signal.aborted) return false;
      if (status.status === 'ok') {
        setServiceState('ready');
        return true;
      }
      setServiceState('unavailable');
      return false;
    } catch {
      if (controller.signal.aborted) return false;
      setServiceState('unavailable');
      return false;
    }
  }, [client]);

  const refreshSessions = useCallback(async () => {
    sessionsAbortRef.current?.abort();
    const controller = new AbortController();
    sessionsAbortRef.current = controller;
    setSessionsLoading(true);
    try {
      const next = await client.listSessions(controller.signal);
      if (controller.signal.aborted) return;
      setSessions(next);
    } catch {
      if (!controller.signal.aborted) {
        setSessions([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setSessionsLoading(false);
      }
    }
  }, [client]);

  const loadSessionDetail = useCallback(
    async (sessionId: string) => {
      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      setSessionDetailLoading(true);
      try {
        const response = await client.getSession(sessionId, controller.signal);
        if (controller.signal.aborted) return;
        setSessionDetail(response.session);
      } catch {
        if (!controller.signal.aborted) {
          setSessionDetail(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSessionDetailLoading(false);
        }
      }
    },
    [client],
  );

  const selectSession = useCallback(
    async (sessionId: string) => {
      setSelectedSessionId(sessionId);
      await saveSelectedSessionId(sessionId);
      await loadSessionDetail(sessionId);
    },
    [loadSessionDetail],
  );

  const startDraft = useCallback(async () => {
    detailAbortRef.current?.abort();
    setSelectedSessionId(null);
    setSessionDetail(null);
    setSessionDetailLoading(false);
    await saveSelectedSessionId(null);
  }, []);

  const beginNewSession = useCallback(async () => {
    if (selectedSessionId === null) return false;
    await startDraft();
    return true;
  }, [selectedSessionId, startDraft]);

  useEffect(() => bindRunNotificationDeepLink((sessionId) => void selectSession(sessionId)), [
    selectSession,
  ]);

  const createSession = useCallback(
    async (title = '新对话') => {
      try {
        const session = await client.createSession(title);
        await refreshSessions();
        await selectSession(session.id);
        return session;
      } catch (error) {
        if (error instanceof ApiProblem && error.problem.code === 'AUTH_REQUIRED') {
          throw error;
        }
        return null;
      }
    },
    [client, refreshSessions, selectSession],
  );

  const updateSession = useCallback(
    async (sessionId: string, input: UpdateSessionRequest) => {
      try {
        const session = await client.updateSession(sessionId, input);
        await refreshSessions();
        if (selectedSessionId === sessionId) {
          setSessionDetail((prev) => (prev ? { ...prev, ...session } : prev));
        }
        return session;
      } catch {
        return null;
      }
    },
    [client, refreshSessions, selectedSessionId],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await client.deleteSession(sessionId);
        const listed = await client.listSessions();
        setSessions(listed);
        if (selectedSessionId === sessionId) {
          const fallback = listed[0]?.id ?? null;
          if (fallback) {
            await selectSession(fallback);
          } else {
            await startDraft();
          }
        }
        return true;
      } catch {
        return false;
      }
    },
    [client, selectSession, selectedSessionId, startDraft],
  );

  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;

    const bootstrap = async () => {
      setSelectedSessionId(null);
      setSessionDetail(null);
      setSessions([]);

      const ready = await refreshReadiness();
      if (cancelled || !ready) return;

      setSessionsLoading(true);
      try {
        const listed = await client.listSessions();
        if (cancelled) return;
        setSessions(listed);

        /** 对齐 Web：冷启动进入本地草稿，不自动恢复上次会话。 */
        await startDraft();
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      readinessAbortRef.current?.abort();
      sessionsAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, [hydrated, client, refreshReadiness, startDraft, authEpoch]);

  /** API 地址变更后单独探活，避免 bootstrap cleanup abort 导致一直 unavailable。 */
  useEffect(() => {
    if (!hydrated) return;
    void refreshReadiness();
  }, [hydrated, resolvedBaseUrl, refreshReadiness]);

  const runHost = useAgentHostRun({
    client,
    serviceReady: serviceState === 'ready',
    selectedSessionId,
    sessionDetail,
    refreshSessions,
    reloadSessionDetail: loadSessionDetail,
    createSession: async (title) => {
      const session = await createSession(title);
      return session ? { id: session.id } : null;
    },
    ensureSessionSelected,
    pushNotificationsEnabled: preferences.pushNotificationsEnabled,
    runUiStore,
  });

  const runHostRef = useRef(runHost);
  runHostRef.current = runHost;

  const sessionValue = useMemo<AgentHostSessionContextValue>(
    () => ({
      client,
      apiBaseUrl: resolvedBaseUrl,
      serviceState,
      sessions,
      sessionsLoading,
      selectedSessionId,
      sessionDetail,
      sessionDetailLoading,
      submitRun: runHost.submitRun,
      sendFollowUp: runHost.sendFollowUp,
      cancelFollowUp: runHost.cancelFollowUp,
      beginArtifactRevision: runHost.beginArtifactRevision,
      respondClarification: (answer) => {
        const interrupt = runUiStore.getComposer().activeInterrupt;
        if (interrupt?.kind === 'clarification') {
          return runHostRef.current.respondClarification(interrupt.interruptId, answer);
        }
        return Promise.resolve();
      },
      respondToolApproval: (approve) => {
        const interrupt = runUiStore.getComposer().activeInterrupt;
        if (interrupt?.kind === 'tool_approval') {
          return runHostRef.current.respondToolApproval(interrupt.interruptId, approve);
        }
        return Promise.resolve();
      },
      pauseActiveRun: runHost.pauseActiveRun,
      resumeActiveRun: runHost.resumeActiveRun,
      restoreArtifactVersion: runHost.restoreArtifactVersion,
      cancelActiveRun: runHost.cancelActiveRun,
      dismissComposerBlock: runHost.dismissComposerBlock,
      refreshReadiness,
      refreshSessions,
      selectSession,
      beginNewSession,
      createSession,
      updateSession,
      deleteSession,
    }),
    [
      client,
      resolvedBaseUrl,
      serviceState,
      sessions,
      sessionsLoading,
      selectedSessionId,
      sessionDetail,
      sessionDetailLoading,
      runHost.submitRun,
      runHost.sendFollowUp,
      runHost.cancelFollowUp,
      runHost.beginArtifactRevision,
      runHost.pauseActiveRun,
      runHost.resumeActiveRun,
      runHost.restoreArtifactVersion,
      runHost.cancelActiveRun,
      runHost.dismissComposerBlock,
      refreshReadiness,
      refreshSessions,
      selectSession,
      beginNewSession,
      createSession,
      updateSession,
      deleteSession,
      runUiStore,
    ],
  );

  return (
    <AgentRunUiStoreContext.Provider value={runUiStore}>
      <AgentHostSessionContext.Provider value={sessionValue}>{children}</AgentHostSessionContext.Provider>
    </AgentRunUiStoreContext.Provider>
  );
}

export function useAgentHostSession(): AgentHostSessionContextValue {
  const ctx = useContext(AgentHostSessionContext);
  if (!ctx) {
    throw new Error('useAgentHostSession must be used within AgentHostProvider');
  }
  return ctx;
}

export function useAgentHost(): AgentHostContextValue {
  useAgentHostRunUiAllSlices();
  const session = useAgentHostSession();
  const conversation = useAgentHostConversation();
  const connectionState = useAgentHostConnectionState();
  const workbench = useAgentHostWorkbenchSnapshot();
  const composer = useAgentHostComposerSnapshot();

  return {
    ...session,
    conversation,
    connectionState,
    runSubmitting: composer.runSubmitting,
    defaultModelId: composer.defaultModelId,
    defaultReasoningEffort: composer.defaultReasoningEffort,
    composerModels: composer.composerModels,
    composerPlan: composer.composerPlan,
    composerPlanExplanation: composer.composerPlanExplanation,
    followUpItems: composer.followUpItems,
    followUpSubmittingId: composer.followUpSubmittingId,
    composerRevisionSeed: composer.composerRevisionSeed,
    composerBlock: composer.composerBlock,
    dismissComposerBlock: session.dismissComposerBlock,
    activeInterrupt: composer.activeInterrupt,
    hitlSubmitting: composer.hitlSubmitting,
    workbench: workbench.workbench,
    workbenchReportId: workbench.workbenchReportId,
    workbenchCount: workbench.workbenchCount,
    hasDeliverables: workbench.hasDeliverables,
    activityEmphasis: workbench.activityEmphasis,
    activeRunId: workbench.activeRunId,
  };
}
