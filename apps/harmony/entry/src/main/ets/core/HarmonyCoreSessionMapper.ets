import { PreviewSessionState } from '../preview/PreviewFixtureLoader';
import { ChatLine, SessionDrawerRow, UserAttachmentRow, emptyWorkbench, parseComposer } from '../preview/PreviewModels';
import { FileRefRow, LiveRunStateRow, SessionSummaryRow } from './HarmonyCoreTypes';
import { HarmonyPlanProjector } from './HarmonyPlanProjector';

export class HarmonyCoreSessionMapper {
  static emptyLanding(): PreviewSessionState {
    return {
      fileName: 'core-landing',
      title: '新对话',
      isLanding: true,
      lines: [],
      chrome: {
        connectionState: 'idle',
        serviceState: 'unknown',
        runSummary: '',
        peekBarTitle: '',
        peekBarSubtitle: '',
      },
      problemTitle: '',
      problemDetail: '',
      composer: parseComposer(undefined),
      workbench: emptyWorkbench(),
      replay: null,
      sessionDrawer: { draftTitle: '新对话', searchPlaceholder: '搜索会话', sessions: [] },
      uiHints: { initialDrawerOpen: false },
    };
  }

  static drawerRows(
    summaries: SessionSummaryRow[],
    selectedId: string | undefined,
    runningIds: Set<string>,
  ): SessionDrawerRow[] {
    const sorted = summaries.slice().sort((a, b) => {
      const pin = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
      if (pin !== 0) {
        return pin;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return sorted.map((s) => ({
      id: s.id,
      title: s.title,
      time: s.updatedAt.length >= 10 ? s.updatedAt.substring(0, 10) : s.updatedAt,
      active: s.id === selectedId,
      pinned: s.isPinned ?? false,
      running: runningIds.has(s.id),
    }));
  }

  static linesFromLive(live: LiveRunStateRow): ChatLine[] {
    const lines: ChatLine[] = [{
      id: live.userMessageId.length > 0 ? `message:${live.userMessageId}` : `live:${live.runId}:user`,
      role: 'user',
      text: live.userText,
      attachments: HarmonyCoreSessionMapper.userAttachmentRows(live.userAttachments ?? []),
      process: [],
    }];
    lines.push({
      id: live.assistantMessageId.length > 0 ? `message:${live.assistantMessageId}` : `live:${live.runId}:assistant`,
      role: 'assistant',
      text: live.assistantText,
      process: live.reasoningText !== undefined && live.reasoningText.length > 0 ? [{
        kind: 'reasoning',
        id: `${live.runId}-reasoning`,
        name: '',
        summary: '',
        status: live.deliveryStatus,
        duration: '',
        statusLabel: '',
        content: live.reasoningText,
        durationMs: 0,
        streaming: live.deliveryStatus === 'streaming',
      }] : [],
      artifacts: live.artifacts ?? [],
      deliveryStatus: live.deliveryStatus,
    });
    return lines;
  }

  private static userAttachmentRows(refs: FileRefRow[]): UserAttachmentRow[] {
    return refs.map((ref) => ({
      fileId: ref.fileId,
      fileName: ref.fileName,
      mediaType: ref.mediaType,
      size: ref.size,
      status: ref.status,
      fileKind: ref.fileKind,
      previewUrl: ref.previewUrl,
    }));
  }

  static mergeLive(
    base: PreviewSessionState,
    live: LiveRunStateRow | undefined,
    summaries: SessionSummaryRow[],
    selectedId: string | undefined,
    runningIds: Set<string>,
    loading: boolean,
  ): PreviewSessionState {
    const activeLive =
      live !== undefined && selectedId !== undefined && live.sessionId === selectedId ? live : undefined;
    const title =
      summaries.find((s) => s.id === (activeLive?.sessionId ?? selectedId))?.title ??
      activeLive?.userText.substring(0, 40) ??
      base.title;
    const lines = activeLive ? HarmonyCoreSessionMapper.mergeLiveLines(base.lines, activeLive) : base.lines;
    const clar = activeLive?.composerClarification;
    const approval = activeLive?.composerToolApproval;
    const selectedRunning = selectedId !== undefined && runningIds.has(selectedId);
    const tailAssistantStreaming = (() => {
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.role !== 'assistant') {
          continue;
        }
        return line.deliveryStatus === 'streaming' || line.deliveryStatus === 'pending' ||
          line.pendingText !== undefined;
      }
      return false;
    })();
    const runtimeSteer =
      (selectedRunning ||
        (activeLive !== undefined &&
          selectedId !== undefined &&
          !HarmonyRunLiveReducerIsTerminal(activeLive.deliveryStatus)) ||
        tailAssistantStreaming) &&
      clar === undefined &&
      approval === undefined;
    let composerMode = 'default';
    if (clar !== undefined) {
      composerMode = 'clarification';
    } else if (approval !== undefined) {
      composerMode = 'hitl';
    }
    const runActive =
      runtimeSteer ||
        base.composer.submitting ||
        (activeLive !== undefined && !HarmonyRunLiveReducerIsTerminal(activeLive.deliveryStatus));
    const livePlan = activeLive?.plan;
    const showPlan = HarmonyPlanProjector.shouldShowOverlay(livePlan, runActive);
    const composer = {
      ...base.composer,
      revisionDraftSeed: base.composer.revisionDraftSeed,
      composerMode,
      composerTextMode: runtimeSteer ? 'steer' : (clar !== undefined ? 'clarification' : 'new-run'),
      submitting: runtimeSteer || base.composer.submitting,
      showPlan,
      planExplanation: livePlan?.explanation ?? '',
      planSteps: livePlan?.steps.slice() ?? [],
      clarification: clar !== undefined ?
        { question: clar.question, options: clar.options.slice(), allowFreeText: clar.allowFreeText } :
        undefined,
      toolApprovalTitle: approval !== undefined ? approval.title : '',
      toolApprovalNote: approval?.sandboxNote ?? '',
      toolApprovalItems: approval !== undefined ?
        approval.items.map((item) => ({
          itemId: item.itemId,
          toolName: item.toolName,
          command: item.command,
        })) :
        [],
    };
    return {
      ...base,
      canLoadOlderMessages: base.canLoadOlderMessages ?? false,
      loadingOlderMessages: base.loadingOlderMessages ?? false,
      canLoadOlderSessionSummaries: base.canLoadOlderSessionSummaries ?? false,
      loadingOlderSessionSummaries: base.loadingOlderSessionSummaries ?? false,
      fileName: selectedId ?? 'core-landing',
      title,
      isLanding: lines.length === 0 && selectedId === undefined,
      lines,
      workbench: base.workbench,
      composer,
      chrome: {
        ...base.chrome,
        connectionState: loading ? 'connecting' : base.chrome.connectionState,
        runSummary: activeLive && !HarmonyRunLiveReducerIsTerminal(activeLive.deliveryStatus) ? 'Running…' : '',
      },
      sessionDrawer: {
        ...base.sessionDrawer,
        sessions: HarmonyCoreSessionMapper.drawerRows(summaries, selectedId, runningIds),
      },
    };
  }

  private static mergeLiveLines(base: ChatLine[], live: LiveRunStateRow): ChatLine[] {
    const tail = HarmonyCoreSessionMapper.linesFromLive(live);
    if (base.length >= 2 && base[base.length - 2].role === 'user' &&
      base[base.length - 2].text === live.userText && base[base.length - 1].role === 'assistant') {
      return base.slice(0, base.length - 2).concat(tail);
    }
    return base.concat(tail);
  }
}

function HarmonyRunLiveReducerIsTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
