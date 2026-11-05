import { CreateRunResponseRow, FileRefRow, LiveRunStateRow, RunSnapshotRow, RunStreamEventRow, SessionActiveRunRow, SessionDetailRow } from './HarmonyCoreTypes';
import { HarmonyInterruptParser } from './HarmonyInterruptParser';
import { ArtifactCardRow } from '../preview/PreviewModels';

export class HarmonyRunLiveReducer {
  fromCreateRun(
    sessionId: string,
    userText: string,
    response: CreateRunResponseRow,
    userAttachments: FileRefRow[] = [],
  ): LiveRunStateRow {
    return {
      sessionId,
      runId: response.runId,
      userMessageId: response.userMessageId,
      assistantMessageId: response.assistantMessageId,
      userText,
      userAttachments: userAttachments.slice(),
      assistantText: '',
      reasoningText: '',
      artifacts: [],
      deliveryStatus: 'streaming',
      cursor: 0,
    };
  }

  fromActiveRun(detail: SessionDetailRow, activeRun: SessionActiveRunRow): LiveRunStateRow {
    const assistantMsg = detail.messages.filter((m) => m.id === activeRun.assistantMessageId).pop();
    const userMsg =
      detail.messages.filter((m) => m.role === 'user' && m.runId === activeRun.runId).pop() ??
      detail.messages.filter((m) => m.role === 'user').pop();
    return {
      sessionId: detail.id,
      runId: activeRun.runId,
      userMessageId: userMsg?.id ?? '',
      assistantMessageId: activeRun.assistantMessageId,
      userText: userMsg?.content ?? '',
      userAttachments: userMsg?.attachments ?? [],
      assistantText: assistantMsg?.content ?? '',
      reasoningText: assistantMsg?.reasoning ?? '',
      artifacts: HarmonyRunLiveReducer.artifactsFromMetadata(assistantMsg?.metadata),
      deliveryStatus: activeRun.status.length > 0 ? activeRun.status : 'streaming',
      cursor: activeRun.lastEventSequence ?? 0,
    };
  }

  applySnapshot(state: LiveRunStateRow, snapshot: RunSnapshotRow): LiveRunStateRow {
    const terminal = HarmonyRunLiveReducer.isTerminal(snapshot.status);
    let next: LiveRunStateRow = {
      ...state,
      assistantText: snapshot.assistantContent && snapshot.assistantContent.length > 0 ?
        snapshot.assistantContent : state.assistantText,
      reasoningText: HarmonyRunLiveReducer.reasoningFromBlocks(snapshot.blocks) || state.reasoningText,
      artifacts: HarmonyRunLiveReducer.artifactsFromBlocks(snapshot.blocks) ?? state.artifacts,
      cursor: Math.max(state.cursor, snapshot.lastEventSequence ?? 0),
      deliveryStatus: terminal ? snapshot.status : state.deliveryStatus,
    };
    if (snapshot.activeInterrupt !== undefined) {
      const pending = HarmonyInterruptParser.fromInterruptObject(snapshot.activeInterrupt);
      next = {
        ...next,
        composerClarification: pending?.clarification,
        composerToolApproval: pending?.toolApproval,
      };
    }
    return next;
  }

  applyEvent(state: LiveRunStateRow, event: RunStreamEventRow): LiveRunStateRow {
    if (event.seq <= state.cursor) {
      return state;
    }
    if (event.seq > state.cursor + 1 && state.cursor > 0) {
      return state;
    }
    let next: LiveRunStateRow = { ...state, cursor: event.seq };
    if (event.type === 'message.delta') {
      const payload = event.payload;
      const delta = payload ? `${payload['delta'] ?? ''}` : '';
      if (delta.length > 0) {
        next.assistantText = `${next.assistantText}${delta}`;
      }
    } else if (event.type === 'reasoning.delta') {
      const delta = event.payload ? `${event.payload['delta'] ?? ''}` : '';
      next.reasoningText = `${next.reasoningText}${delta}`;
    } else if (event.type === 'run.completed') {
      next.deliveryStatus = 'completed';
    } else if (event.type === 'run.failed') {
      next.deliveryStatus = 'failed';
    } else if (event.type === 'run.cancelled') {
      next.deliveryStatus = 'cancelled';
    } else if (event.type === 'run.snapshot') {
      const payload = event.payload;
      const blocks = payload?.['blocks'] as Array<Record<string, Object>> | undefined;
      const reasoning = HarmonyRunLiveReducer.reasoningFromBlocks(blocks);
      if (reasoning.length > 0) {
        next.reasoningText = reasoning;
      }
      const artifacts = HarmonyRunLiveReducer.artifactsFromBlocks(blocks);
      if (artifacts !== undefined && artifacts.length > 0) {
        next.artifacts = artifacts;
      }
      const status = event.payload ? `${event.payload['status'] ?? ''}` : '';
      if (HarmonyRunLiveReducer.isTerminal(status)) {
        next.deliveryStatus = status;
      }
    } else if (event.type === 'interrupt.created' || event.type === 'run.waiting_for_user') {
      const pending = HarmonyInterruptParser.fromEventPayload(event.payload);
      if (pending !== undefined) {
        next.composerClarification = pending.clarification;
        next.composerToolApproval = pending.toolApproval;
      }
    } else if (event.type === 'interrupt.resolved' || event.type === 'interrupt.cancelled') {
      next.composerClarification = undefined;
      next.composerToolApproval = undefined;
    } else if (event.type === 'tool.started') {
      const toolCallId = event.payload ? `${event.payload['toolCallId'] ?? ''}` : '';
      if (toolCallId.length > 0) {
        next.latestToolCallId = toolCallId;
      }
    }
    return next;
  }

  static isTerminal(status: string): boolean {
    return status === 'completed' || status === 'failed' || status === 'cancelled';
  }

  private static reasoningFromBlocks(blocks: Array<Record<string, Object>> | undefined): string {
    if (blocks === undefined) {
      return '';
    }
    return blocks
      .filter((b) => `${b['type'] ?? ''}` === 'reasoning')
      .map((b) => `${b['content'] ?? ''}`)
      .join('');
  }

  private static artifactsFromMetadata(
    metadata: Record<string, Object> | undefined,
  ): ArtifactCardRow[] {
    return HarmonyRunLiveReducer.artifactsFromBlocks(
      metadata?.['blocks'] as Array<Record<string, Object>> | undefined,
    ) ?? [];
  }

  private static artifactsFromBlocks(
    blocks: Array<Record<string, Object>> | undefined,
  ): ArtifactCardRow[] | undefined {
    if (blocks === undefined) {
      return undefined;
    }
    return blocks
      .filter((block) => `${block['type'] ?? ''}` === 'artifact')
      .map((block) => ({
        artifactId: `${block['artifactId'] ?? ''}`,
        fileId: `${block['fileId'] ?? ''}`,
        fileName: `${block['fileName'] ?? '文件'}`,
        mediaType: `${block['mediaType'] ?? 'text/plain'}`,
        fileKind: `${block['fileKind'] ?? 'text'}`,
        size: Number(block['size'] ?? 0),
        status: `${block['status'] ?? 'ready'}`,
        seriesId: block['seriesId'] !== undefined ? `${block['seriesId']}` : undefined,
        versionNumber: block['versionNumber'] !== undefined ? Number(block['versionNumber']) : undefined,
        isCurrent: block['isCurrent'] === true,
      }))
      .filter((row) => row.artifactId.length > 0);
  }
}
