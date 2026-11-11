import type { PendingUserInputView, RunSnapshot, RunStreamEvent } from '@harness/agent-protocol';
import type { ToolStreamEvent } from '@harness/agent-client';
import type { AgentUiState, WorkbenchState } from '@harness/agent-ui-types';
import {
  appendReasoningDelta,
  appendTextDelta,
  appendUserIntervention,
  applyToolActivityEvent,
  completeReasoning,
  completeTextPhase,
  discardTextBlock,
} from '@harness/agent-conversation';

import { applyRunSnapshotToSession } from './apply-run-snapshot.js';
import { runTerminalStatus } from './run-helpers.js';
import type { ApplyRunEventResult, RunReducerDeps } from './run-reducer-deps.js';

function toolHasNewResource(toolEvent: ToolStreamEvent, deps: RunReducerDeps): boolean {
  return (
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
      toolEvent.toolName === 'read_file' &&
      ((toolEvent.result.scope === 'file' && (toolEvent.result.sections?.length ?? 0) > 0) ||
        (toolEvent.result.scope !== 'file' && toolEvent.result.lines.length > 0))) ||
    (toolEvent.type === 'tool.completed' &&
      toolEvent.toolName === 'read_file_lines' &&
      toolEvent.result.lines.length > 0) ||
    (toolEvent.type === 'tool.completed' &&
      (toolEvent.toolName === 'create_file' || toolEvent.toolName === 'create_report')) ||
    (toolEvent.type === 'tool.completed' &&
      toolEvent.toolName === 'execute_command' &&
      Boolean(deps.collectedArtifactFromCommandResult(toolEvent.result)))
  );
}

function userUrlsFromTask(task: string, deps: RunReducerDeps): ReadonlySet<string> {
  return new Set(
    [...task.matchAll(/https?:\/\/[^\s<>'"\])}]+/giu)].map((match) =>
      deps.canonicalUrl(match[0].replace(/[.,;:!?，。；：！？]+$/gu, '')),
    ),
  );
}

export function applyRunEventToSession(
  sessionId: string,
  sessionState: AgentUiState,
  pendingInputs: PendingUserInputView[],
  sessionPending: boolean,
  event: RunStreamEvent,
  cursor: number,
  task: string,
  deps: RunReducerDeps,
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
      cursor,
      deps,
    );
    if (snap.skipped) {
      return {
        sessionState,
        pendingInputs,
        sessionPending,
        nextCursor: cursor,
        duplicate: true,
      };
    }
    return {
      sessionState: snap.sessionState,
      pendingInputs: snap.pendingInputs,
      sessionPending: snap.sessionPending,
      nextCursor: snap.nextCursor,
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
    const nextPending = deps.uniquePendingInputs(update.pendingUserInputs ?? []);
    return {
      sessionState: {
        ...sessionState,
        conversation: deps.mergePendingSteerState(sessionState.conversation, nextPending),
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
          .filter((item) => !(item.kind === 'user' && item.pendingInputId === intervention.inputId))
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
    const delta = event.payload as Extract<
      RunStreamEvent['payload'],
      { type: 'message.delta' }
    >;
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
    const update = event.payload as Extract<
      RunStreamEvent['payload'],
      { type: 'message.phase.completed' | 'message.discarded' }
    >;
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
    const reasoning = event.payload as Extract<
      RunStreamEvent['payload'],
      { type: 'reasoning.delta' }
    >;
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
    const round = event.payload as Extract<
      RunStreamEvent['payload'],
      { type: 'model.round.completed' }
    >;
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
    const workbench =
      sessionState.workbench ??
      ({
        runId: event.runId,
        title: '执行计划',
        subtitle: '正在按计划执行',
        activeView: 'tool_results',
        activityStatus: 'running',
        executions: [],
        followMode: 'auto',
        sources: [],
        open: true,
      } satisfies WorkbenchState);
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
      return {
        sessionState,
        pendingInputs,
        sessionPending,
        nextCursor: cursor,
        duplicate: true,
      };
    }
    const control = event.payload.control;
    if (!control) {
      return {
        sessionState,
        pendingInputs,
        sessionPending,
        nextCursor: cursor,
        duplicate: true,
      };
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
    const hasNewResource = toolHasNewResource(toolEvent, deps);
    const workbench = deps.mergeWorkbenchDeliverables(
      deps.applyToolEvent(
        existing,
        toolEvent,
        deps.resolveWorkbenchOpenOnToolEvent(existing?.open, toolEvent, {
          suppressed,
          hasNewResource,
        }),
        userUrlsFromTask(task, deps),
      ),
      sessionState.workbench,
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
