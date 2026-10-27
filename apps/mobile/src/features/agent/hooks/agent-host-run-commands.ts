import { ApiProblem, createClientId, type AgentClient } from '@harness/agent-client';
import type {
  ArtifactRef,
  PendingUserInputView,
  ToolApprovalDecision,
} from '@harness/agent-protocol';
import type { AgentUiState, ConversationItem } from '@harness/agent-ui-types';
import type { RunSnapshot } from '@harness/agent-protocol';
import { uniquePendingInputs } from '@harness/agent-projection';
import type { Dispatch, SetStateAction } from 'react';
import { router } from 'expo-router';
import { showAppAlert } from '@/lib/app-alert';

import type { ConnectionState } from '../components/connection-pill';
import type { ComposerSubmitPayload } from '../model/composer-submit.types';
import type { RunHostSessionStore } from './agent-host-run-session-store';

export type RunCommandsDeps = {
  client: AgentClient;
  store: RunHostSessionStore;
  defaultModelId: string | null;
  sessionDetailActiveRunId?: string | null;
  createSession: (title?: string) => Promise<{ id: string } | null>;
  ensureSessionSelected: (sessionId: string) => void;
  refreshSessions: () => Promise<void>;
  reloadSessionDetail: (sessionId: string) => Promise<void>;
  setConnectionState: Dispatch<SetStateAction<ConnectionState>>;
  setFollowUpSubmittingId: Dispatch<SetStateAction<string | null>>;
  setHitlSubmitting: Dispatch<SetStateAction<boolean>>;
  setComposerRevisionSeed: Dispatch<SetStateAction<string | null>>;
  setSessionPending: (sessionId: string, pending: boolean) => void;
  setSessionState: (sessionId: string, next: AgentUiState) => void;
  syncSelectedRunUi: () => void;
  applyComposerBlockFromError: (sessionId: string, error: unknown) => string | null;
  observeRun: (
    sessionId: string,
    runId: string,
    task?: string,
    skipInitialSnapshot?: boolean,
  ) => Promise<void>;
  applyRunSnapshot: (sessionId: string, snapshot: RunSnapshot) => void;
};

export function createRunCommands(deps: RunCommandsDeps) {
  const { client, store } = deps;

  const submitRun = async (payload: ComposerSubmitPayload) => {
    const task = payload.content.trim();
    const modelId = payload.modelId || deps.defaultModelId;
    if (!task || !modelId) return;

    let sessionId = store.selectedSessionIdRef.current;
    if (!sessionId) {
      try {
        const created = await deps.createSession(task.slice(0, 80));
        sessionId = created?.id ?? null;
      } catch (error) {
        if (error instanceof ApiProblem && error.problem.code === 'AUTH_REQUIRED') {
          showAppAlert({
            title: '需要登录',
            message: '请先登录后再发送消息。',
            buttons: [
              { text: '取消', style: 'cancel' },
              { text: '去登录', onPress: () => router.push('/settings/login') },
            ],
          });
        }
        return;
      }
      if (!sessionId) return;
      deps.ensureSessionSelected(sessionId);
    }

    const runtimeActive = Boolean(
      store.pendingSessionsRef.current[sessionId] ||
        store.sessionStatesRef.current[sessionId]?.activeRunId,
    );
    if (runtimeActive) {
      try {
        const result = (await client.submitPendingInput(sessionId, task)) as {
          input?: PendingUserInputView;
        };
        if (result.input) {
          store.pendingInputsRef.current = uniquePendingInputs([
            ...store.pendingInputsRef.current,
            result.input,
          ]);
          if (result.input.kind === 'steer' && result.input.status === 'pending') {
            try {
              const promoted = (await client.promotePendingInput(result.input.id)) as PendingUserInputView;
              store.pendingInputsRef.current = uniquePendingInputs(
                store.pendingInputsRef.current.map((item) =>
                  item.id === promoted.id ? promoted : item,
                ),
              );
            } catch {
              // promote 失败时仍保留 pending 队列项。
            }
          }
          deps.syncSelectedRunUi();
        }
      } catch (error) {
        deps.applyComposerBlockFromError(sessionId, error);
      }
      return;
    }

    const localUserId = createClientId();
    const localAssistantId = createClientId();
    const optimisticUser: ConversationItem = {
      id: localUserId,
      kind: 'user',
      content: task,
      createdAt: new Date().toISOString(),
      attachments: payload.optimisticAttachments?.length ? payload.optimisticAttachments : undefined,
      skillNames: payload.skillNames,
    };
    const optimisticAssistant: ConversationItem = {
      id: localAssistantId,
      kind: 'assistant',
      blocks: [],
      pending: true,
      deliveryStatus: 'streaming',
    };

    const base = store.sessionStatesRef.current[sessionId] ?? {
      label: task.slice(0, 80),
      subtitle: '',
      conversation: [],
    };
    deps.setSessionState(sessionId, {
      ...base,
      conversation: [...base.conversation, optimisticUser, optimisticAssistant],
    });
    deps.setSessionPending(sessionId, true);
    deps.setConnectionState('connecting');

    const sessionRevision = store.sessionStatesRef.current[sessionId]?.revisionContext;
    const artifactVersionContext =
      payload.artifactVersionContext ??
      (sessionRevision ? { ...sessionRevision, changeSummary: task.slice(0, 500) } : undefined);

    try {
      const run = await client.createRun(
        sessionId,
        task,
        modelId,
        payload.reasoningEffort,
        payload.attachmentIds ?? [],
        artifactVersionContext,
        payload.skillNames ?? [],
      );
      const current = store.sessionStatesRef.current[sessionId];
      if (current) {
        deps.setSessionState(sessionId, {
          ...current,
          revisionContext: undefined,
          activeRunId: run.runId,
            conversation: current.conversation.map((item) => {
              if (item.id === localUserId) {
                return {
                  ...item,
                  id: run.userMessageId,
                  attachments: item.kind === 'user' ? item.attachments : undefined,
                };
              }
              if (item.id === localAssistantId) {
                return { ...item, id: run.assistantMessageId, runId: run.runId };
              }
              return item;
            }),
        });
      }
      await deps.observeRun(sessionId, run.runId, task, true);
      await deps.refreshSessions();
      deps.setComposerRevisionSeed(null);
    } catch (error) {
      const blockDetail = deps.applyComposerBlockFromError(sessionId, error);
      deps.setSessionPending(sessionId, false);
      deps.setConnectionState('offline');
      const failureText = blockDetail ?? '本次回答未完成，请稍后重试。';
      const current = store.sessionStatesRef.current[sessionId];
      if (current) {
        deps.setSessionState(sessionId, {
          ...current,
          conversation: current.conversation.map((item) =>
            item.kind === 'assistant' && item.id === localAssistantId
              ? {
                  ...item,
                  pending: false,
                  deliveryStatus: 'failed',
                  blocks: [
                    {
                      id: `${localAssistantId}-failed`,
                      type: 'text',
                      content: failureText,
                    },
                  ],
                }
              : item,
          ),
        });
      }
    }
  };

  const beginArtifactRevision = (artifact: ArtifactRef) => {
    const sessionId = store.selectedSessionIdRef.current;
    if (!sessionId || !artifact.seriesId || artifact.versionNumber === undefined) return;
    const series = store.sessionStatesRef.current[sessionId]?.workbench?.artifactSeries?.find(
      (item) => item.seriesId === artifact.seriesId,
    );
    const expectedCurrentArtifactId = series?.currentArtifactId;
    if (!expectedCurrentArtifactId) return;
    const current = store.sessionStatesRef.current[sessionId];
    if (!current) return;
    deps.setSessionState(sessionId, {
      ...current,
      revisionContext: {
        seriesId: artifact.seriesId,
        baseArtifactId: artifact.artifactId,
        expectedCurrentArtifactId,
      },
    });
    deps.setComposerRevisionSeed(
      `请基于 ${artifact.logicalName ?? artifact.fileName} v${artifact.versionNumber} 修改：`,
    );
  };

  const sendFollowUp = async (inputId: string) => {
    const sessionId = store.selectedSessionIdRef.current;
    const input = store.pendingInputsRef.current.find((item) => item.id === inputId);
    if (!sessionId || !input) return;
    deps.setFollowUpSubmittingId(inputId);
    try {
      const run = await client.sendPendingInput(inputId);
      store.pendingInputsRef.current = store.pendingInputsRef.current.filter(
        (item) => item.id !== inputId,
      );
      const current = store.sessionStatesRef.current[sessionId];
      if (current && !current.conversation.some((item) => item.id === run.userMessageId)) {
        deps.setSessionState(sessionId, {
          ...current,
          activeRunId: run.runId,
          conversation: [
            ...current.conversation,
            {
              id: run.userMessageId,
              kind: 'user',
              content: input.content,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
      deps.setSessionPending(sessionId, true);
      deps.setConnectionState('connecting');
      await deps.observeRun(sessionId, run.runId, input.content, true);
      await deps.refreshSessions();
      deps.syncSelectedRunUi();
    } catch {
      // 发送失败时保留队列项。
    } finally {
      deps.setFollowUpSubmittingId(null);
    }
  };

  const cancelFollowUp = async (inputId: string) => {
    try {
      const updated = (await client.cancelPendingInput(inputId)) as PendingUserInputView;
      store.pendingInputsRef.current = uniquePendingInputs(
        store.pendingInputsRef.current.map((item) => (item.id === inputId ? updated : item)),
      );
      deps.syncSelectedRunUi();
    } catch {
      // 取消失败时忽略。
    }
  };

  const respondClarification = async (interruptId: string, answer: string) => {
    const sessionId = store.selectedSessionIdRef.current;
    if (!sessionId) return;
    const runId = store.sessionStatesRef.current[sessionId]?.activeRunId;
    if (!runId) return;
    deps.setHitlSubmitting(true);
    try {
      const result = await client.controlRun(runId, {
        type: 'respond',
        interruptId,
        payload: { answer: answer.trim() },
      });
      deps.applyRunSnapshot(sessionId, result.snapshot);
      if (result.snapshot.status === 'running' || result.snapshot.status === 'queued') {
        void deps.observeRun(sessionId, runId, '', true);
      }
    } catch {
      try {
        deps.applyRunSnapshot(sessionId, await client.getRun(runId));
      } catch {
        // keep prior projection
      }
    } finally {
      deps.setHitlSubmitting(false);
    }
  };

  const respondToolApproval = async (interruptId: string, approve: boolean) => {
    const sessionId = store.selectedSessionIdRef.current;
    if (!sessionId) return;
    const state = store.sessionStatesRef.current[sessionId];
    const runId = state?.activeRunId;
    const interrupt = state?.activeInterrupt;
    if (!runId || interrupt?.kind !== 'tool_approval' || interrupt.interruptId !== interruptId) {
      return;
    }
    const decisions: ToolApprovalDecision[] = interrupt.payload.items.map((item) => ({
      itemId: item.itemId,
      toolCallId: item.toolCallId,
      argumentsHash: item.argumentsHash,
      decision: approve ? 'approve' : 'reject',
    }));
    deps.setHitlSubmitting(true);
    try {
      const result = await client.controlRun(runId, {
        type: approve ? 'approve' : 'reject',
        interruptId,
        decisions,
      });
      deps.applyRunSnapshot(sessionId, result.snapshot);
      if (result.snapshot.status === 'running' || result.snapshot.status === 'queued') {
        void deps.observeRun(sessionId, runId, '', true);
      }
    } catch {
      try {
        deps.applyRunSnapshot(sessionId, await client.getRun(runId));
      } catch {
        // keep prior projection
      }
    } finally {
      deps.setHitlSubmitting(false);
    }
  };

  const controlActiveRun = async (command: { type: 'pause' } | { type: 'resume' }) => {
    const sessionId = store.selectedSessionIdRef.current;
    if (!sessionId) return;
    const runId =
      store.sessionStatesRef.current[sessionId]?.activeRunId ?? deps.sessionDetailActiveRunId;
    if (!runId) return;
    try {
      const result = await client.controlRun(runId, command);
      deps.applyRunSnapshot(sessionId, result.snapshot);
      if (result.snapshot.status === 'running' || result.snapshot.status === 'queued') {
        void deps.observeRun(sessionId, runId, '', true);
      }
    } catch {
      try {
        deps.applyRunSnapshot(sessionId, await client.getRun(runId));
      } catch {
        // keep prior projection
      }
    }
  };

  const restoreArtifactVersion = async (artifact: ArtifactRef) => {
    const sessionId = store.selectedSessionIdRef.current;
    if (!sessionId || !artifact.seriesId) return;
    const expectedCurrentArtifactId = store.sessionStatesRef.current[
      sessionId
    ]?.workbench?.artifactSeries?.find((series) => series.seriesId === artifact.seriesId)
      ?.currentArtifactId;
    if (!expectedCurrentArtifactId) return;
    try {
      await client.restoreArtifact(artifact.artifactId, expectedCurrentArtifactId);
      await deps.refreshSessions();
      await deps.reloadSessionDetail(sessionId);
    } catch {
      // 恢复失败时保留当前投影。
    }
  };

  const cancelActiveRun = async () => {
    const sessionId = store.selectedSessionIdRef.current;
    if (!sessionId) return;
    const state = store.sessionStatesRef.current[sessionId];
    const runId = state?.activeRunId ?? deps.sessionDetailActiveRunId;
    if (!runId) return;
    try {
      await client.cancelRun(runId);
    } catch {
      // 取消请求失败时仍依赖 SSE 终态。
    }
  };

  return {
    submitRun,
    beginArtifactRevision,
    sendFollowUp,
    cancelFollowUp,
    respondClarification,
    respondToolApproval,
    pauseActiveRun: () => controlActiveRun({ type: 'pause' }),
    resumeActiveRun: () => controlActiveRun({ type: 'resume' }),
    restoreArtifactVersion,
    cancelActiveRun,
  };
}
