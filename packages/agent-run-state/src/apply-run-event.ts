import { normalizeSourceUrl } from '@harness/agent-protocol';
import type { PendingUserInputView, RunSnapshot, RunStreamEvent } from '@harness/agent-protocol';
import type {
  MessageDeltaEvent,
  MessageDiscardedEvent,
  MessagePhaseCompletedEvent,
  ModelRoundCompletedEvent,
  ReasoningDeltaEvent,
  ToolStreamEvent,
} from '@harness/agent-client';
import {
  appendReasoningDelta,
  appendTextDelta,
  appendUserIntervention,
  applyToolActivityEvent,
  completeReasoning,
  completeTextPhase,
  discardTextBlock,
} from '@harness/agent-conversation';
import { applyToolEvent, mergePendingSteerState, uniquePendingInputs } from '@harness/agent-projection';
import type { AgentUiState, WorkbenchState } from '@harness/agent-ui-types';
import { applyRunSnapshotToSession } from './apply-run-snapshot.js';
import { runTerminalStatus } from './run-helpers.js';

function canonicalUrl(url: string): string {
  try {
    return normalizeSourceUrl(url);
  } catch {
    return url;
  }
}

export type ApplyRunEventResult = {
  sessionState: AgentUiState;
  pendingInputs: PendingUserInputView[];
  sessionPending: boolean;
  nextCursor: number;
  errorDetail?: string;
  gap?: boolean;
  duplicate?: boolean;
};

export function applyRunEventToSession(
  sessionId: string,
  sessionState: AgentUiState,
  pendingInputs: PendingUserInputView[],
  sessionPending: boolean,
  event: RunStreamEvent,
  cursor: number,
  task = '',
): ApplyRunEventResult {
  if (event.seq <= cursor) {
    return {
      sessionState,
      pendingInputs,
      sessionPending,
      nextCursor: cursor,
      duplicate: true,
    };
  }
  if (event.type === 'run.snapshot') {
    const snap = applyRunSnapshotToSession(
      sessionId,
      sessionState,
      event.payload as RunSnapshot,
      pendingInputs,
    );
    return {
      sessionState: snap.sessionState,
      pendingInputs: snap.pendingInputs,
      sessionPending: snap.sessionPending,
      nextCursor: event.seq,
      errorDetail: snap.errorDetail,
    };
  }
  if (event.seq !== cursor + 1) {
    return {
      sessionState,
      pendingInputs,
      sessionPending,
      nextCursor: cursor,
      gap: true,
    };
  }

  if (event.type === 'user_input.updated') {
    if (!('pendingUserInputs' in event.payload)) throw new Error('INVALID_USER_INPUT_UPDATE');
    const update = event.payload;
    const nextPending = uniquePendingInputs(update.pendingUserInputs ?? []);
    return {
      sessionState: {
        ...sessionState,
        conversation: mergePendingSteerState(sessionState.conversation, nextPending),
      },
      pendingInputs: nextPending,
      sessionPending,
      nextCursor: event.seq,
    };
  }

  if (event.type === 'user.intervention' && 'inputId' in event.payload) {
    const intervention = event.payload;
    if (
      !sessionState.conversation.some(
        (item) => item.kind === 'assistant' && item.id === intervention.messageId,
      )
    ) {
      throw new Error('RUN_EVENT_TARGET_MISSING');
    }
    return {
      sessionState: {
        ...sessionState,
        conversation: sessionState.conversation
          .filter(
            (item) => !(item.kind === 'user' && item.pendingInputId === intervention.inputId),
          )
          .map((item) =>
            item.kind === 'assistant' && item.id === intervention.messageId
              ? { ...item, blocks: appendUserIntervention(item.blocks, intervention) }
              : item,
          ),
      },
      pendingInputs,
      sessionPending,
      nextCursor: event.seq,
    };
  }

  if (event.type === 'message.delta') {
    const delta = event.payload as MessageDeltaEvent;
    if (
      !sessionState.conversation.some(
        (item) => item.kind === 'assistant' && item.id === delta.messageId,
      )
    ) {
      throw new Error('RUN_EVENT_TARGET_MISSING');
    }
    return {
      sessionState: {
        ...sessionState,
        conversation: sessionState.conversation.map((item) =>
          item.kind === 'assistant' && item.id === delta.messageId
            ? { ...item, blocks: appendTextDelta(item.blocks, delta) }
            : item,
        ),
      },
      pendingInputs,
      sessionPending,
      nextCursor: event.seq,
    };
  }

  if (event.type === 'message.phase.completed' || event.type === 'message.discarded') {
    const update = event.payload as MessagePhaseCompletedEvent | MessageDiscardedEvent;
    return {
      sessionState: {
        ...sessionState,
        conversation: sessionState.conversation.map((item) =>
          item.kind === 'assistant' && item.id === update.messageId
            ? {
                ...item,
                blocks:
                  update.type === 'message.phase.completed'
                    ? completeTextPhase(item.blocks, update)
                    : discardTextBlock(item.blocks, update),
              }
            : item,
        ),
      },
      pendingInputs,
      sessionPending,
      nextCursor: event.seq,
    };
  }

  if (event.type === 'reasoning.delta') {
    const reasoning = event.payload as ReasoningDeltaEvent;
    return {
      sessionState: {
        ...sessionState,
        conversation: sessionState.conversation.map((item) =>
          item.kind === 'assistant' && item.id === reasoning.messageId
            ? { ...item, blocks: appendReasoningDelta(item.blocks, reasoning) }
            : item,
        ),
      },
      pendingInputs,
      sessionPending,
      nextCursor: event.seq,
    };
  }

  if (event.type === 'model.round.completed') {
    const round = event.payload as ModelRoundCompletedEvent;
    const workbench =
      sessionState.workbench && round.context
        ? { ...sessionState.workbench, context: round.context }
        : sessionState.workbench;
    return {
      sessionState: {
        ...sessionState,
        conversation: sessionState.conversation.map((item) =>
          item.kind === 'assistant' &&
          item.blocks.some(
            (b) => b.type === 'reasoning' && b.roundSequence === round.observation.roundSequence,
          )
            ? {
                ...item,
                blocks: completeReasoning(
                  item.blocks,
                  round.observation.roundSequence,
                  round.observation.durationMs,
                ),
              }
            : item,
        ),
        ...(round.context ? { context: round.context } : {}),
        workbench,
      },
      pendingInputs,
      sessionPending,
      nextCursor: event.seq,
    };
  }

  if (event.type === 'plan.updated') {
    const payload = event.payload as Extract<RunStreamEvent['payload'], { type: 'plan.updated' }>;
    const plan = {
      ...(payload.explanation ? { explanation: payload.explanation } : {}),
      plan: payload.plan,
    };
    const workbench = sessionState.workbench ?? {
      runId: event.runId,
      title: '执行计划',
      subtitle: '正在按计划执行',
      activeView: 'activity' as const,
      activityStatus: 'running' as const,
      executions: [],
      followMode: 'auto' as const,
      sources: [],
      open: true,
    };
    return {
      sessionState: { ...sessionState, workbench: { ...workbench, plan } },
      pendingInputs,
      sessionPending: true,
      nextCursor: event.seq,
    };
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
    if (!('control' in event.payload)) {
      return { sessionState, pendingInputs, sessionPending, nextCursor: event.seq };
    }
    const control = event.payload.control;
    if (!control) {
      return { sessionState, pendingInputs, sessionPending, nextCursor: event.seq };
    }
    const activeInterrupt =
      event.type === 'interrupt.resolved' || event.type === 'interrupt.cancelled'
        ? undefined
        : 'interrupt' in event.payload
          ? event.payload.interrupt
          : control.activeInterrupt;
    const workbench = sessionState.workbench
      ? {
          ...sessionState.workbench,
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
      : sessionState.workbench;
    return {
      sessionState: {
        ...sessionState,
        activeInterrupt,
        workbench,
      },
      pendingInputs,
      sessionPending: true,
      nextCursor: event.seq,
    };
  }

  if (
    event.type === 'tool.started' ||
    event.type === 'tool.completed' ||
    event.type === 'tool.failed' ||
    event.type === 'tool.cancelled'
  ) {
    const toolEvent = event.payload as ToolStreamEvent;
    if (
      !sessionState.conversation.some(
        (item) => item.kind === 'assistant' && item.id === toolEvent.messageId,
      )
    ) {
      throw new Error('RUN_EVENT_TARGET_MISSING');
    }
    const existing =
      sessionState.workbench?.runId === event.runId ? sessionState.workbench : undefined;
    const suppressed = sessionState.autoOpenSuppressedRunIds?.includes(event.runId) ?? false;
    const hasNewResource =
      (toolEvent.type === 'tool.completed' &&
        (toolEvent.toolName === 'web_search'
          ? toolEvent.result.results.length > 0
          : toolEvent.toolName === 'web_fetch' &&
            toolEvent.result.results.some(
              (item) => item.status === 'succeeded' && item.passages.length > 0,
            ))) ||
      (toolEvent.type === 'tool.completed' &&
        toolEvent.toolName === 'search_file' &&
        toolEvent.result.matches.length > 0) ||
      (toolEvent.type === 'tool.completed' &&
        toolEvent.toolName === 'read_file_lines' &&
        toolEvent.result.lines.length > 0) ||
      (toolEvent.type === 'tool.completed' &&
        (toolEvent.toolName === 'create_file' || toolEvent.toolName === 'create_report'));
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
    workbench.context = sessionState.context;
    workbench.executions = workbench.executions.map((item) => ({
      ...item,
      runId: event.runId,
    }));
    return {
      sessionState: {
        ...sessionState,
        workbench,
        conversation: sessionState.conversation.map((item) =>
          item.kind === 'assistant' && item.id === toolEvent.messageId
            ? { ...item, blocks: applyToolActivityEvent(item.blocks, toolEvent), workbench }
            : item,
        ),
      },
      pendingInputs,
      sessionPending,
      nextCursor: event.seq,
    };
  }

  if (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  ) {
    const status = runTerminalStatus(event.type);
    const workbench = sessionState.workbench
      ? { ...sessionState.workbench, activityStatus: status as WorkbenchState['activityStatus'] }
      : undefined;
    return {
      sessionState: {
        ...sessionState,
        activeRunId: undefined,
        activeInterrupt: undefined,
        workbench,
        conversation: sessionState.conversation.map((item) =>
          item.kind === 'assistant' && item.pending
            ? {
                ...item,
                pending: false,
                deliveryStatus: status,
                workbench,
                ...(event.type === 'run.failed' && 'code' in event.payload
                  ? { error: { code: event.payload.code, detail: event.payload.detail } }
                  : {}),
              }
            : item,
        ),
      },
      pendingInputs,
      sessionPending: false,
      nextCursor: event.seq,
      errorDetail:
        event.type === 'run.failed' && 'detail' in event.payload
          ? event.payload.detail
          : undefined,
    };
  }

  return {
    sessionState,
    pendingInputs,
    sessionPending,
    nextCursor: event.seq,
  };
}
