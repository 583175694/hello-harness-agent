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

import { createMobileAgentClientForBaseUrl, resolveMobileApiBaseUrl } from '@/lib/agent-client';
import { bindRunNotificationDeepLink } from '@/lib/run-local-notifications';
import { saveSelectedSessionId } from '@/lib/storage';
import { useAppPreferences } from '@/providers/app-preferences-provider';

import type { ConnectionState } from '../components/connection-pill';
import type { ModelFixture } from '../components/composer-model-menu';
import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import { useAgentHostRun } from '../hooks/use-agent-host-run';
import type { ComposerSubmitPayload } from '../model/composer-submit.types';
import type { MobileServiceState } from '../model/mobile-chrome.types';
import type { SessionComposerBlock } from '../lib/session-composer-block';

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
  /** 对齐 Web `startDraft`：本地空白草稿，不调用 createSession API。 */
  beginNewSession: () => Promise<void>;
  createSession: (title?: string) => Promise<SessionSummary | null>;
  updateSession: (sessionId: string, input: UpdateSessionRequest) => Promise<SessionSummary | null>;
  deleteSession: (sessionId: string) => Promise<boolean>;
};

const AgentHostContext = createContext<AgentHostContextValue | null>(null);

export function AgentHostProvider({ children }: { children: ReactNode }) {
  const { preferences, hydrated } = useAppPreferences();
  const resolvedBaseUrl = resolveMobileApiBaseUrl(preferences.apiBaseUrl);

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
    if (selectedSessionId === null) return;
    await startDraft();
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
      } catch {
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
  }, [hydrated, resolvedBaseUrl, client, refreshReadiness, startDraft]);

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
  });

  const value = useMemo<AgentHostContextValue>(
    () => ({
      client,
      apiBaseUrl: resolvedBaseUrl,
      serviceState,
      sessions,
      sessionsLoading,
      selectedSessionId,
      sessionDetail,
      sessionDetailLoading,
      conversation: runHost.conversation,
      connectionState: runHost.connectionState,
      runSubmitting: runHost.runSubmitting,
      defaultModelId: runHost.defaultModelId,
      defaultReasoningEffort: runHost.defaultReasoningEffort,
      composerModels: runHost.composerModels,
      composerPlan: runHost.composerPlan,
      composerPlanExplanation: runHost.composerPlanExplanation,
      followUpItems: runHost.followUpItems,
      followUpSubmittingId: runHost.followUpSubmittingId,
      composerRevisionSeed: runHost.composerRevisionSeed,
      composerBlock: runHost.composerBlock,
      dismissComposerBlock: runHost.dismissComposerBlock,
      activeInterrupt: runHost.activeInterrupt,
      hitlSubmitting: runHost.hitlSubmitting,
      workbench: runHost.workbench,
      workbenchReportId: runHost.workbenchReportId,
      workbenchCount: runHost.workbenchCount,
      hasDeliverables: runHost.hasDeliverables,
      activityEmphasis: runHost.activityEmphasis,
      activeRunId: runHost.activeRunId,
      submitRun: runHost.submitRun,
      sendFollowUp: runHost.sendFollowUp,
      cancelFollowUp: runHost.cancelFollowUp,
      beginArtifactRevision: runHost.beginArtifactRevision,
      respondClarification: (answer) =>
        runHost.activeInterrupt?.kind === 'clarification'
          ? runHost.respondClarification(runHost.activeInterrupt.interruptId, answer)
          : Promise.resolve(),
      respondToolApproval: (approve) =>
        runHost.activeInterrupt?.kind === 'tool_approval'
          ? runHost.respondToolApproval(runHost.activeInterrupt.interruptId, approve)
          : Promise.resolve(),
      pauseActiveRun: runHost.pauseActiveRun,
      resumeActiveRun: runHost.resumeActiveRun,
      restoreArtifactVersion: runHost.restoreArtifactVersion,
      cancelActiveRun: runHost.cancelActiveRun,
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
      runHost.conversation,
      runHost.connectionState,
      runHost.runSubmitting,
      runHost.defaultModelId,
      runHost.defaultReasoningEffort,
      runHost.composerModels,
      runHost.composerPlan,
      runHost.composerPlanExplanation,
      runHost.followUpItems,
      runHost.followUpSubmittingId,
      runHost.composerRevisionSeed,
      runHost.composerBlock,
      runHost.dismissComposerBlock,
      runHost.activeInterrupt,
      runHost.hitlSubmitting,
      runHost.workbench,
      runHost.workbenchReportId,
      runHost.workbenchCount,
      runHost.hasDeliverables,
      runHost.activityEmphasis,
      runHost.activeRunId,
      runHost.submitRun,
      runHost.sendFollowUp,
      runHost.cancelFollowUp,
      runHost.beginArtifactRevision,
      runHost.respondClarification,
      runHost.respondToolApproval,
      runHost.pauseActiveRun,
      runHost.resumeActiveRun,
      runHost.restoreArtifactVersion,
      runHost.cancelActiveRun,
      refreshReadiness,
      refreshSessions,
      selectSession,
      beginNewSession,
      createSession,
      updateSession,
      deleteSession,
    ],
  );

  return <AgentHostContext.Provider value={value}>{children}</AgentHostContext.Provider>;
}

export function useAgentHost(): AgentHostContextValue {
  const ctx = useContext(AgentHostContext);
  if (!ctx) {
    throw new Error('useAgentHost must be used within AgentHostProvider');
  }
  return ctx;
}
