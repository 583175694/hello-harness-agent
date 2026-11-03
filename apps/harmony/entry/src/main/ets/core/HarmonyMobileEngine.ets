import { http } from '@kit.NetworkKit';
import { PreviewSessionState } from '../preview/PreviewFixtureLoader';
import { parseComposer } from '../preview/PreviewModels';
import { HarnessAgentHttp } from './HarnessAgentHttp';
import { HarmonyCoreSessionMapper } from './HarmonyCoreSessionMapper';
import { HarmonyRunLiveReducer } from './HarmonyRunLiveReducer';
import { HarmonyWorkbenchProjector } from './HarmonyWorkbenchProjector';
import { HarmonyWorkbenchArtifactProjector } from './HarmonyWorkbenchArtifactProjector';
import {
  HarmonyWorkbenchFocusProjector,
  WorkbenchFocusTargetRow,
} from './HarmonyWorkbenchFocusProjector';
import { ArtifactSeriesRow } from './HarmonyCoreTypes';
import {
  CreateRunResponseRow,
  FileRefRow,
  LiveRunStateRow,
  PendingUserInputRow,
  PublicAgentConfigRow,
  RunDetailRow,
  RunSnapshotRow,
  SessionDetailRow,
  SessionSummaryRow,
  PersistedMessageRow,
} from './HarmonyCoreTypes';

/** 对齐 packages/mobile-core SessionEngineController（鸿蒙薄 HTTP 子集）。 */
export class HarmonyMobileEngine {
  private summaries: SessionSummaryRow[] = [];
  private selectedSessionId: string | undefined = undefined;
  private pendingSessions: Set<string> = new Set();
  private liveRun: LiveRunStateRow | undefined = undefined;
  private observingRunId: string | undefined = undefined;
  private sseBusy: boolean = false;
  private publicConfig: PublicAgentConfigRow | undefined = undefined;
  private reducer: HarmonyRunLiveReducer = new HarmonyRunLiveReducer();
  private workbenchRunId: string | undefined = undefined;
  private sessionMessages: Map<string, import('./HarmonyCoreTypes').PersistedMessageRow[]> = new Map();
  private sessionArtifactSeries: Map<string, ArtifactSeriesRow[]> = new Map();
  private paginationBefore: Map<string, string | undefined> = new Map();
  private loadingOlderSessions: Set<string> = new Set();
  private composerSkills: string[] = [];
  private composerRevisionContext: Record<string, string> | undefined = undefined;
  private composerRevisionSeed: string | undefined = undefined;
  private composerAttachmentIds: string[] = [];
  private composerAttachmentNames: string[] = [];
  private skillPickerNames: string[] = [];
  private runSseClient: http.HttpRequest | undefined = undefined;
  private workbenchChrome: {
    open: boolean;
    followMode: string;
    focusedToolCallId?: string;
    focusHint?: string;
  } = { open: false, followMode: 'auto' };
  private lastProblemTitle: string = '';
  private lastProblemDetail: string = '';
  snapshot: PreviewSessionState = HarmonyCoreSessionMapper.emptyLanding();
  onSnapshot: (state: PreviewSessionState) => void = () => {};

  private clearLastProblem(): void {
    this.lastProblemTitle = '';
    this.lastProblemDetail = '';
  }

  private captureLastProblem(error: Object): void {
    const parsed = HarnessAgentHttp.problemFromThrownError(error);
    this.lastProblemTitle = parsed.title;
    this.lastProblemDetail = parsed.detail;
  }

  /** E9：401 mid-run — 停止 SSE，保留会话 UI，提示重新登录。 */
  private abortRunObserversForAuth(): void {
    this.runSseClient?.destroy();
    this.runSseClient = undefined;
    this.observingRunId = undefined;
    this.sseBusy = false;
    this.pendingSessions.clear();
    if (this.liveRun !== undefined) {
      this.liveRun = { ...this.liveRun, deliveryStatus: 'failed' };
    }
    this.emit(false);
  }

  private handleHttpFailure(error: Object, rethrow: boolean = false): void {
    this.captureLastProblem(error);
    if (HarnessAgentHttp.isAuthRequiredFromError(error)) {
      this.abortRunObserversForAuth();
    } else {
      this.emit(false);
    }
    if (rethrow) {
      throw error as Error;
    }
  }

  private applyWorkbenchUiHints(state: PreviewSessionState): PreviewSessionState {
    return {
      ...state,
      problemTitle: this.lastProblemTitle,
      problemDetail: this.lastProblemDetail,
      uiHints: {
        ...state.uiHints,
        workbenchOpen: this.workbenchChrome.open,
        workbenchFocusedToolCallId: this.workbenchChrome.focusedToolCallId,
        workbenchFocusHint: this.workbenchChrome.focusHint,
      },
    };
  }

  private emit(loading: boolean = false): void {
    this.snapshot = this.applyWorkbenchUiHints(
      HarmonyCoreSessionMapper.mergeLive(
        this.snapshot,
        this.liveRun,
        this.summaries,
        this.selectedSessionId,
        this.pendingSessions,
        loading,
      ),
    );
    this.onSnapshot(this.snapshot);
  }

  private resetWorkbenchChrome(): void {
    this.workbenchChrome = { open: false, followMode: 'auto' };
  }

  async refreshReadiness(): Promise<void> {
    const ready = await HarnessAgentHttp.getReadyz();
    if (ready) {
      this.clearLastProblem();
    }
    this.snapshot = {
      ...this.snapshot,
      chrome: {
        ...this.snapshot.chrome,
        connectionState: ready ? 'live' : 'offline',
        serviceState: ready ? 'ready' : 'unavailable',
      },
    };
    this.emit(false);
  }

  async refreshSkillPicker(): Promise<void> {
    const response = await HarnessAgentHttp.getJson<{ skills: { name: string }[] }>('/api/skills');
    this.skillPickerNames = response.skills.map((s) => s.name.trim()).filter((n) => n.length > 0);
  }

  getComposerModelOptions(): { id: string; label: string; reasoningOptions: string[] }[] {
    if (!this.publicConfig) {
      return [];
    }
    return this.publicConfig.models.map((raw) => {
      const id = `${raw['id'] ?? ''}`;
      const label = `${raw['label'] ?? id}`;
      const reasoning = raw['reasoning'] as Record<string, Object> | undefined;
      const supported = reasoning !== undefined && `${reasoning['supported']}` === 'true';
      const levelsRaw = reasoning !== undefined ? reasoning['levels'] as string[] | undefined : undefined;
      const levels =
        supported && levelsRaw !== undefined && levelsRaw.length > 0 ?
          levelsRaw.map((l) => `${l}`) :
          [`${reasoning !== undefined ? reasoning['default'] ?? 'off' : 'off'}`];
      return { id, label, reasoningOptions: levels };
    }).filter((m) => m.id.length > 0);
  }

  getSkillPickerNames(): string[] {
    return this.skillPickerNames.slice();
  }

  async refreshPublicConfig(): Promise<void> {
    const config = await HarnessAgentHttp.getJson<PublicAgentConfigRow>('/api/agent/config/public');
    this.publicConfig = config;
  }

  async refreshSessionList(): Promise<void> {
    const response = await HarnessAgentHttp.getJson<{ sessions: SessionSummaryRow[] }>('/api/agent/sessions');
    this.summaries = response.sessions ?? [];
    this.emit(false);
  }

  async selectSession(sessionId: string): Promise<void> {
    if (this.selectedSessionId !== sessionId) {
      this.resetWorkbenchChrome();
    }
    this.selectedSessionId = sessionId;
    if (this.pendingSessions.has(sessionId)) {
      this.refreshSnapshotShellFromSessionCache(sessionId);
      this.emit(false);
      return;
    }
    await this.loadSessionDetail(sessionId, false);
  }

  async loadSessionDetail(sessionId: string, force: boolean): Promise<void> {
    if (this.pendingSessions.has(sessionId) && !force) {
      if (this.selectedSessionId === sessionId) {
        this.refreshSnapshotShellFromSessionCache(sessionId);
        this.emit(false);
      }
      return;
    }
    this.emit(true);
    const response = await HarnessAgentHttp.getJson<{ session: SessionDetailRow }>(
      `/api/agent/sessions/${sessionId}?limit=100`,
    );
    const detail = response.session;
    if (this.pendingSessions.has(sessionId)) {
      return;
    }
    if (detail.activeRun) {
      this.pendingSessions.add(sessionId);
    } else {
      this.pendingSessions.delete(sessionId);
    }
    this.sessionMessages.set(sessionId, detail.messages);
    this.sessionArtifactSeries.set(sessionId, detail.artifactSeries ?? []);
    this.paginationBefore.set(sessionId, detail.pagination?.nextBefore);
    const canLoadOlder = HarmonyMobileEngine.canLoadOlderFromPagination(detail);
    const isCurrentSelection = this.selectedSessionId === sessionId;
    if (!isCurrentSelection) {
      // E1：晚到 detail 不写当前 UI。E6：仅当当前 Session 无进行中 Run 时为后台 Session 挂 SSE。
      if (detail.activeRun) {
        const selectedId = this.selectedSessionId;
        const selectedHasLiveRun =
          selectedId !== undefined &&
          this.liveRun !== undefined &&
          this.liveRun.sessionId === selectedId &&
          !HarmonyRunLiveReducer.isTerminal(this.liveRun.deliveryStatus);
        if (!selectedHasLiveRun) {
          const live = this.reducer.fromActiveRun(detail, detail.activeRun);
          this.attachRunObserver(live);
        }
      }
      this.emit(false);
      return;
    }
    let lines = HarmonyMobileEngine.linesFromMessages(detail.messages);
    lines = this.mergeConversationWithLiveRun(sessionId, lines);
    const followUps = HarmonyMobileEngine.followUpsFromDetail(detail);
    const composer = parseComposer(undefined);
    composer.followUps = followUps;
    const series = detail.artifactSeries ?? [];
    const workbench =
      series.length > 0
        ? HarmonyWorkbenchArtifactProjector.applySeries(
          this.snapshot.workbench ?? HarmonyWorkbenchArtifactProjector.placeholderFromSeries(series),
          series,
        )
        : this.snapshot.workbench;
    this.snapshot = {
      ...HarmonyCoreSessionMapper.emptyLanding(),
      fileName: detail.id,
      title: detail.title,
      isLanding: detail.messages.length === 0,
      lines,
      composer,
      workbench,
      canLoadOlderMessages: canLoadOlder,
      loadingOlderMessages: false,
      sessionDrawer: {
        draftTitle: '新对话',
        searchPlaceholder: '搜索会话',
        sessions: HarmonyCoreSessionMapper.drawerRows(this.summaries, sessionId, this.pendingSessions),
      },
    };
    this.emit(false);
    if (detail.activeRun) {
      const live = this.reducer.fromActiveRun(detail, detail.activeRun);
      this.attachRunObserver(live);
    } else {
      const runId = HarmonyMobileEngine.latestAssistantRunId(detail);
      if (runId !== undefined) {
        void this.hydrateRunDetail(sessionId, runId);
      }
    }
  }

  async loadOlderMessages(sessionId: string): Promise<void> {
    const before = this.paginationBefore.get(sessionId);
    if (before === undefined || before.length === 0 || this.loadingOlderSessions.has(sessionId)) {
      return;
    }
    this.loadingOlderSessions.add(sessionId);
    if (this.selectedSessionId === sessionId) {
      this.snapshot = { ...this.snapshot, loadingOlderMessages: true };
      this.onSnapshot(this.snapshot);
    }
    try {
      const response = await HarnessAgentHttp.getJson<{ session: SessionDetailRow }>(
        `/api/agent/sessions/${sessionId}?limit=100&before=${encodeURIComponent(before)}`,
      );
      const detail = response.session;
      this.paginationBefore.set(sessionId, detail.pagination?.nextBefore);
      const merged = HarmonyMobileEngine.mergeMessagePages(
        this.sessionMessages.get(sessionId) ?? [],
        detail.messages,
      );
      this.sessionMessages.set(sessionId, merged);
      if (this.selectedSessionId === sessionId) {
        this.snapshot = {
          ...this.snapshot,
          lines: HarmonyMobileEngine.linesFromMessages(merged),
          canLoadOlderMessages: HarmonyMobileEngine.canLoadOlderFromPagination(detail),
          loadingOlderMessages: false,
        };
        this.emit(false);
      }
    } finally {
      this.loadingOlderSessions.delete(sessionId);
      if (this.selectedSessionId === sessionId && this.snapshot.loadingOlderMessages === true) {
        this.snapshot = { ...this.snapshot, loadingOlderMessages: false };
        this.onSnapshot(this.snapshot);
      }
    }
  }

  async beginNewConversation(): Promise<void> {
    this.selectedSessionId = undefined;
    this.liveRun = undefined;
    this.workbenchRunId = undefined;
    this.resetWorkbenchChrome();
    this.snapshot = HarmonyCoreSessionMapper.emptyLanding();
    this.snapshot.sessionDrawer.sessions =
      HarmonyCoreSessionMapper.drawerRows(this.summaries, undefined, this.pendingSessions);
    this.emit(false);
  }

  private async awaitFileReady(fileId: string): Promise<FileRefRow> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const ref = await HarnessAgentHttp.getJson<FileRefRow>(`/api/agent/files/${fileId}`);
      if (ref.status === 'ready') {
        return ref;
      }
      if (ref.status === 'failed' || ref.status === 'rejected') {
        throw new Error(ref.errorCode ?? `文件处理失败（${ref.status}）`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('文件处理超时');
  }

  private async ensureSessionForComposer(titleHint: string): Promise<string> {
    let sessionId = this.selectedSessionId;
    if (sessionId === undefined) {
      const created = await HarnessAgentHttp.postJson<{ session: SessionSummaryRow }>(
        '/api/agent/sessions',
        { title: titleHint.substring(0, 40) || '新对话' },
      );
      this.summaries = this.summaries.filter((s) => s.id !== created.session.id).concat([created.session]);
      sessionId = created.session.id;
      this.selectedSessionId = sessionId;
    }
    return sessionId;
  }

  async uploadComposerAttachment(fileName: string, fileData: ArrayBuffer, mediaType: string): Promise<void> {
    if (this.composerAttachmentNames.length >= 4) {
      return;
    }
    const sessionId = await this.ensureSessionForComposer(fileName.substring(0, 40) || '附件');
    const uploaded = await HarnessAgentHttp.uploadSessionFile(sessionId, fileName, mediaType, fileData);
    const ready = await this.awaitFileReady(uploaded.fileId);
    this.composerAttachmentIds.push(ready.fileId);
    this.composerAttachmentNames.push(ready.fileName);
    this.snapshot = {
      ...this.snapshot,
      composer: {
        ...this.snapshot.composer,
        attachmentNames: this.composerAttachmentNames.slice(),
      },
    };
    this.onSnapshot(this.snapshot);
  }

  addComposerSkill(skill: string): void {
    const normalized = skill.trim();
    if (normalized.length === 0 || this.composerSkills.includes(normalized) || this.composerSkills.length >= 6) {
      return;
    }
    this.composerSkills.push(normalized);
    this.snapshot = {
      ...this.snapshot,
      composer: {
        ...this.snapshot.composer,
        selectedSkills: this.composerSkills.slice(),
      },
    };
    this.onSnapshot(this.snapshot);
  }

  async submitComposer(text: string, modelId?: string, reasoningEffort?: string, skillNames?: string[]): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    let sessionId = this.selectedSessionId;
    if (sessionId === undefined) {
      const created = await HarnessAgentHttp.postJson<{ session: SessionSummaryRow }>(
        '/api/agent/sessions',
        { title: trimmed.substring(0, 40) || '新对话' },
      );
      this.summaries = this.summaries.filter((s) => s.id !== created.session.id).concat([created.session]);
      sessionId = created.session.id;
      this.selectedSessionId = sessionId;
    }
    if (this.runtimeActiveFor(sessionId)) {
      await HarnessAgentHttp.postJson(`/api/agent/sessions/${sessionId}/pending-inputs`, {
        content: trimmed,
        idempotencyKey: HarnessAgentHttp.randomClientId(),
      });
      await this.refreshPendingInputsUi(sessionId);
      return;
    }
    const config = this.publicConfig;
    if (!config) {
      throw new Error('Public agent config not loaded');
    }
    const model =
      modelId !== undefined && modelId.trim().length > 0 ? modelId.trim() : config.defaultModel;
    const reasoning =
      reasoningEffort !== undefined && reasoningEffort.trim().length > 0 ?
        reasoningEffort.trim() :
        'off';
    this.pendingSessions.add(sessionId);
    this.snapshot = {
      ...this.snapshot,
      composer: { ...this.snapshot.composer, submitting: true },
    };
    this.emit(true);
    let response: CreateRunResponseRow;
    try {
      const skills = (skillNames !== undefined && skillNames.length > 0) ? skillNames : this.composerSkills;
      const body: Record<string, string | string[] | number | boolean | Object | null | undefined> = {
        content: trimmed,
        model,
        reasoningEffort: reasoning,
        idempotencyKey: HarnessAgentHttp.randomClientId(),
      };
      if (skills.length > 0) {
        body['skillNames'] = skills;
      }
      if (this.composerAttachmentIds.length > 0) {
        body['attachmentIds'] = this.composerAttachmentIds.slice();
      }
      if (this.composerRevisionContext !== undefined) {
        body['artifactVersionContext'] = this.composerRevisionContext;
      }
      response = await HarnessAgentHttp.postJson<CreateRunResponseRow>(
        `/api/agent/sessions/${sessionId}/runs`,
        body,
      );
      this.composerSkills = [];
      this.composerAttachmentIds = [];
      this.composerAttachmentNames = [];
      this.composerRevisionContext = undefined;
      this.composerRevisionSeed = undefined;
    } catch (failure) {
      this.pendingSessions.delete(sessionId);
      const problem = HarnessAgentHttp.problemFromThrownError(failure);
      if (HarnessAgentHttp.isAuthRequiredFromError(failure)) {
        this.handleHttpFailure(failure);
      } else {
        this.lastProblemTitle = problem.title;
        this.lastProblemDetail = problem.detail;
        this.publishCreateRunFailure(
          sessionId,
          trimmed,
          problem.detail.length > 0 ? problem.detail : problem.title,
        );
      }
      throw failure as Error;
    }
    const live = this.reducer.fromCreateRun(sessionId, trimmed, response);
    this.liveRun = live;
    this.attachRunObserver(live);
    this.emit(false);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      return;
    }
    const response = await HarnessAgentHttp.patchJson<{ session: SessionSummaryRow }>(
      `/api/agent/sessions/${sessionId}`,
      { title: trimmed },
    );
    const updated = response.session;
    this.summaries = this.summaries.map((s) => (s.id === sessionId ? updated : s));
    if (this.selectedSessionId === sessionId) {
      this.snapshot = { ...this.snapshot, title: updated.title };
    }
    this.snapshot = {
      ...this.snapshot,
      sessionDrawer: {
        ...this.snapshot.sessionDrawer,
        sessions: HarmonyCoreSessionMapper.drawerRows(
          this.summaries,
          this.selectedSessionId,
          this.pendingSessions,
        ),
      },
    };
    this.emit(false);
    if (this.selectedSessionId === sessionId) {
      await this.loadSessionDetail(sessionId, true);
    }
  }

  async togglePinSession(sessionId: string): Promise<void> {
    const row = this.summaries.find((s) => s.id === sessionId);
    const nextPinned = !(row?.isPinned ?? false);
    const response = await HarnessAgentHttp.patchJson<{ session: SessionSummaryRow }>(
      `/api/agent/sessions/${sessionId}`,
      { isPinned: nextPinned },
    );
    const updated = response.session;
    this.summaries = this.summaries.map((s) => (s.id === sessionId ? updated : s));
    this.snapshot = {
      ...this.snapshot,
      sessionDrawer: {
        ...this.snapshot.sessionDrawer,
        sessions: HarmonyCoreSessionMapper.drawerRows(
          this.summaries,
          this.selectedSessionId,
          this.pendingSessions,
        ),
      },
    };
    this.emit(false);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await HarnessAgentHttp.delete(`/api/agent/sessions/${sessionId}`);
    this.summaries = this.summaries.filter((s) => s.id !== sessionId);
    this.pendingSessions.delete(sessionId);
    this.sessionMessages.delete(sessionId);
    this.sessionArtifactSeries.delete(sessionId);
    this.paginationBefore.delete(sessionId);
    if (this.liveRun?.sessionId === sessionId) {
      this.runSseClient?.destroy();
      this.runSseClient = undefined;
      this.observingRunId = undefined;
      this.sseBusy = false;
      this.liveRun = undefined;
    }
    if (this.selectedSessionId === sessionId) {
      const next = this.summaries[0];
      if (next) {
        await this.selectSession(next.id);
      } else {
        await this.beginNewConversation();
      }
    } else {
      this.emit(false);
    }
  }

  async cancelActiveRun(): Promise<void> {
    const runId = this.liveRun?.runId;
    if (!runId) {
      return;
    }
    await HarnessAgentHttp.postJson(`/api/agent/runs/${runId}/cancel`, {});
  }

  async respondClarification(answer: string): Promise<void> {
    const live = this.liveRun;
    const clarification = live?.composerClarification;
    if (live === undefined || clarification === undefined) {
      return;
    }
    const trimmed = answer.trim();
    if (trimmed.length === 0) {
      return;
    }
    const response = await HarnessAgentHttp.postJson<{ snapshot: RunSnapshotRow }>(
      `/api/agent/runs/${live.runId}/commands`,
      {
        type: 'respond',
        interruptId: clarification.interruptId,
        payload: { answer: trimmed },
      },
    );
    this.applyControlSnapshot(live, response.snapshot);
  }

  async approveToolCalls(): Promise<void> {
    const live = this.liveRun;
    const approval = live?.composerToolApproval;
    if (live === undefined || approval === undefined) {
      return;
    }
    const decisions = approval.items.map((item) => ({
      itemId: item.itemId,
      toolCallId: item.toolCallId,
      argumentsHash: item.argumentsHash,
      decision: 'approve',
    }));
    const response = await HarnessAgentHttp.postJson<{ snapshot: RunSnapshotRow }>(
      `/api/agent/runs/${live.runId}/commands`,
      {
        type: 'approve',
        interruptId: approval.interruptId,
        decisions,
      },
    );
    this.applyControlSnapshot(live, response.snapshot);
  }

  async rejectToolCalls(): Promise<void> {
    const live = this.liveRun;
    const approval = live?.composerToolApproval;
    if (live === undefined || approval === undefined) {
      return;
    }
    const decisions = approval.items.map((item) => ({
      itemId: item.itemId,
      toolCallId: item.toolCallId,
      argumentsHash: item.argumentsHash,
      decision: 'reject',
    }));
    const response = await HarnessAgentHttp.postJson<{ snapshot: RunSnapshotRow }>(
      `/api/agent/runs/${live.runId}/commands`,
      {
        type: 'reject',
        interruptId: approval.interruptId,
        decisions,
      },
    );
    this.applyControlSnapshot(live, response.snapshot);
  }

  onAppBackground(): void {
    this.runSseClient?.destroy();
    this.runSseClient = undefined;
    this.sseBusy = false;
    this.observingRunId = undefined;
  }

  beginArtifactRevision(artifactId: string): void {
    const ver = this.snapshot.workbench.artifactVersions.find((v) => v.id === artifactId);
    if (ver === undefined || ver.seriesId === undefined || ver.expectedCurrentArtifactId === undefined ||
      ver.versionNumber === undefined) {
      return;
    }
    const logicalName = ver.logicalName ?? '文件';
    this.composerRevisionContext = {
      seriesId: ver.seriesId,
      baseArtifactId: artifactId,
      expectedCurrentArtifactId: ver.expectedCurrentArtifactId,
    };
    this.composerRevisionSeed = `请基于 ${logicalName} v${ver.versionNumber} 修改：`;
    this.snapshot = {
      ...this.snapshot,
      composer: {
        ...this.snapshot.composer,
        revisionDraftSeed: this.composerRevisionSeed,
      },
    };
    this.onSnapshot(this.snapshot);
  }

  clearComposerRevisionSeed(): void {
    this.composerRevisionSeed = undefined;
    this.snapshot = {
      ...this.snapshot,
      composer: {
        ...this.snapshot.composer,
        revisionDraftSeed: undefined,
      },
    };
    this.onSnapshot(this.snapshot);
  }

  async restoreArtifactVersion(artifactId: string, expectedCurrentArtifactId: string): Promise<void> {
    const artifact = artifactId.trim();
    const expected = expectedCurrentArtifactId.trim();
    if (artifact.length === 0 || expected.length === 0) {
      return;
    }
    try {
      await HarnessAgentHttp.postJson(
        `/api/agent/artifacts/${artifact}/restore`,
        {
          expectedCurrentArtifactId: expected,
          idempotencyKey: `harmony-${Date.now()}`,
        },
      );
      this.clearLastProblem();
      const sessionId = this.selectedSessionId;
      if (sessionId !== undefined) {
        await this.loadSessionDetail(sessionId, true);
        await this.refreshWorkbench();
      }
    } catch (error) {
      this.handleHttpFailure(error);
    }
  }

  async onAppForeground(): Promise<void> {
    await this.refreshSessionList();
    const live = this.liveRun;
    if (live !== undefined && !HarmonyRunLiveReducer.isTerminal(live.deliveryStatus)) {
      this.attachRunObserver(live);
      return;
    }
    const sessionId = this.selectedSessionId;
    if (sessionId !== undefined && this.pendingSessions.has(sessionId)) {
      await this.loadSessionDetail(sessionId, true);
    }
  }

  private applyControlSnapshot(prior: LiveRunStateRow, snapshot: RunSnapshotRow): void {
    let next = this.reducer.applySnapshot(prior, snapshot);
    next = {
      ...next,
      composerClarification: undefined,
      composerToolApproval: undefined,
    };
    this.liveRun = next;
    this.emit(false);
  }

  async promotePendingInput(inputId: string): Promise<void> {
    await HarnessAgentHttp.postJson(`/api/agent/pending-inputs/${inputId}/steer`, {});
    const sessionId = this.selectedSessionId;
    if (sessionId !== undefined) {
      await this.refreshPendingInputsUi(sessionId);
    }
  }

  async sendPendingInput(inputId: string): Promise<void> {
    const sessionId = this.selectedSessionId;
    if (sessionId === undefined) {
      return;
    }
    const row = this.snapshot.composer.followUps.find((f) => f.id === inputId);
    const content = row?.content ?? '';
    const response = await HarnessAgentHttp.postJson<CreateRunResponseRow>(
      `/api/agent/pending-inputs/${inputId}/send`,
      {},
    );
    const live = this.reducer.fromCreateRun(sessionId, content, response);
    this.liveRun = live;
    this.attachRunObserver(live);
    await this.refreshPendingInputsUi(sessionId);
  }

  async cancelPendingInput(inputId: string): Promise<void> {
    await HarnessAgentHttp.postJson(`/api/agent/pending-inputs/${inputId}/cancel`, {});
    const sessionId = this.selectedSessionId;
    if (sessionId !== undefined) {
      await this.refreshPendingInputsUi(sessionId);
    }
  }

  async refreshWorkbench(): Promise<void> {
    await this.openWorkbenchPanel(true);
  }

  async openWorkbenchPanel(hydrateOnly: boolean = false): Promise<void> {
    const sessionId = this.selectedSessionId;
    if (sessionId === undefined) {
      return;
    }
    const msgs = this.sessionMessages.get(sessionId) ?? [];
    const runId = this.workbenchRunId ?? HarmonyMobileEngine.latestAssistantRunIdFromMessages(msgs);
    if (runId === undefined) {
      return;
    }
    try {
      await this.hydrateRunDetail(sessionId, runId);
    } catch (_e) {
      // hydrate 失败静默（45 §4.7）
    }
    if (!hydrateOnly) {
      this.workbenchChrome = { ...this.workbenchChrome, open: true };
      this.emit(false);
    }
  }

  async focusWorkbenchToolCall(runId: string, toolCallId: string): Promise<void> {
    const target: WorkbenchFocusTargetRow = {
      kind: 'tool_call',
      runId,
      toolCallId,
      stepId: toolCallId,
    };
    await this.focusWorkbench(target, true);
  }

  async focusWorkbench(target: WorkbenchFocusTargetRow, pinned: boolean = true): Promise<void> {
    const sessionId = this.selectedSessionId;
    if (sessionId === undefined) {
      return;
    }
    try {
      await this.hydrateRunDetail(sessionId, target.runId);
    } catch (_e) {
      // 静默
    }
    const wb = this.snapshot.workbench;
    const activeRunId = this.workbenchRunId ?? target.runId;
    if (activeRunId !== target.runId) {
      this.workbenchChrome = {
        open: true,
        followMode: pinned ? 'pinned' : 'auto',
        focusHint: '无法定位到该步骤，已打开 Activity 总览',
      };
      this.snapshot = {
        ...this.snapshot,
        workbench: { ...wb, initialView: 'activity' },
      };
      this.emit(false);
      return;
    }
    const resolved = HarmonyWorkbenchFocusProjector.apply(wb, target);
    this.workbenchChrome = {
      open: true,
      followMode: pinned ? 'pinned' : 'auto',
      focusedToolCallId: resolved.focusedToolCallId,
      focusHint: resolved.degraded ? resolved.hint : undefined,
    };
    this.snapshot = {
      ...this.snapshot,
      workbench: { ...wb, initialView: resolved.view },
    };
    this.emit(false);
  }

  setWorkbenchOpen(open: boolean): void {
    this.workbenchChrome = { ...this.workbenchChrome, open };
    this.emit(false);
  }

  clearWorkbenchFocusHint(): void {
    if (this.workbenchChrome.focusHint === undefined) {
      return;
    }
    this.workbenchChrome = { ...this.workbenchChrome, focusHint: undefined };
    this.emit(false);
  }

  async bootstrapIfConfigured(): Promise<void> {
    if (HarnessAgentHttp.baseUrl().length === 0) {
      return;
    }
    await this.refreshReadiness();
    await this.refreshPublicConfig();
    await this.refreshSessionList();
    await this.beginNewConversation();
  }

  private syncFollowUpAfterTerminal(sessionId: string): void {
    const delaysMs = [0, 150, 350, 700, 1200];
    delaysMs.forEach((delayMs, index) => {
      setTimeout(() => {
        void (async () => {
          if (this.pendingSessions.has(sessionId)) {
            return;
          }
          try {
            const response = await HarnessAgentHttp.getJson<{ session: SessionDetailRow }>(
              `/api/agent/sessions/${sessionId}?limit=100`,
            );
            if (response.session.activeRun) {
              await this.loadSessionDetail(sessionId, true);
              return;
            }
            if (index === delaysMs.length - 1) {
              await this.loadSessionDetail(sessionId, true);
            }
          } catch (_e) {
            // 与 Web 一致：轮询失败可忽略
          }
        })();
      }, delayMs);
    });
  }

  private async refreshPendingInputsUi(sessionId: string): Promise<void> {
    const response = await HarnessAgentHttp.getJson<{ session: SessionDetailRow }>(
      `/api/agent/sessions/${sessionId}?limit=100`,
    );
    const followUps = HarmonyMobileEngine.followUpsFromDetail(response.session);
    this.snapshot = {
      ...this.snapshot,
      composer: {
        ...this.snapshot.composer,
        followUps,
      },
    };
    this.emit(false);
  }

  /** E2 / R6：不以 stale detail 覆盖更长的 live assistant。 */
  private mergeConversationWithLiveRun(sessionId: string, detailLines: import('../preview/PreviewModels').ChatLine[]):
    import('../preview/PreviewModels').ChatLine[] {
    const live = this.liveRun;
    if (
      live === undefined ||
      live.sessionId !== sessionId ||
      HarmonyRunLiveReducer.isTerminal(live.deliveryStatus)
    ) {
      return detailLines;
    }
    let detailAssistantLen = 0;
    for (let i = detailLines.length - 1; i >= 0; i--) {
      if (detailLines[i].role === 'assistant') {
        detailAssistantLen = detailLines[i].text.length;
        break;
      }
    }
    if (live.assistantText.length >= detailAssistantLen) {
      return HarmonyCoreSessionMapper.linesFromLive(live);
    }
    return detailLines;
  }

  private refreshSnapshotShellFromSessionCache(sessionId: string): void {
    const messages = this.sessionMessages.get(sessionId) ?? [];
    const summary = this.summaries.find((s) => s.id === sessionId);
    let lines = HarmonyMobileEngine.linesFromMessages(messages);
    lines = this.mergeConversationWithLiveRun(sessionId, lines);
    const series = this.sessionArtifactSeries.get(sessionId) ?? [];
    const workbench =
      series.length > 0
        ? HarmonyWorkbenchArtifactProjector.applySeries(
          this.snapshot.workbench ?? HarmonyWorkbenchArtifactProjector.placeholderFromSeries(series),
          series,
        )
        : this.snapshot.workbench;
    this.snapshot = {
      ...this.snapshot,
      fileName: sessionId,
      title: summary?.title ?? this.snapshot.title,
      isLanding: lines.length === 0,
      lines,
      workbench,
      canLoadOlderMessages: (this.paginationBefore.get(sessionId)?.length ?? 0) > 0,
      sessionDrawer: {
        ...this.snapshot.sessionDrawer,
        sessions: HarmonyCoreSessionMapper.drawerRows(this.summaries, sessionId, this.pendingSessions),
      },
    };
  }

  private async hydrateRunDetail(sessionId: string, runId: string): Promise<void> {
    if (this.selectedSessionId !== sessionId) {
      return;
    }
    try {
      const detail = await HarnessAgentHttp.getJson<RunDetailRow>(`/api/agent/runs/${runId}/detail`);
      const projected = HarmonyWorkbenchProjector.fromRunDetail(detail);
      const merged = HarmonyWorkbenchProjector.mergeDeliverables(projected, this.snapshot.workbench);
      const withArtifacts = HarmonyWorkbenchArtifactProjector.applySeries(
        merged,
        this.sessionArtifactSeries.get(sessionId) ?? [],
      );
      if (this.selectedSessionId !== sessionId) {
        return;
      }
      this.workbenchRunId = runId;
      this.snapshot = {
        ...this.snapshot,
        workbench: withArtifacts,
      };
      this.emit(false);
    } catch (_e) {
      // hydrate 可失败静默（对齐 Web）
    }
  }

  private static canLoadOlderFromPagination(detail: SessionDetailRow): boolean {
    const page = detail.pagination;
    if (page === undefined) {
      return false;
    }
    return page.hasMore === true || (page.nextBefore !== undefined && `${page.nextBefore}`.length > 0);
  }

  private static linesFromMessages(messages: PersistedMessageRow[]): import('../preview/PreviewModels').ChatLine[] {
    return messages.map((m) => ({
      role: m.role,
      text: m.content,
      process: m.role === 'assistant' ? HarmonyMobileEngine.processBlocksFromMetadata(m.metadata) : [],
    }));
  }

  private static processBlocksFromMetadata(metadata: Record<string, Object> | undefined): Array<Object> {
    const blocks = metadata?.['blocks'] as Array<Record<string, Object>> | undefined;
    if (blocks === undefined) {
      return [];
    }
    return blocks.flatMap((block) => {
      const type = `${block['type'] ?? ''}`;
      if (type === 'reasoning') {
        return [{
          kind: 'reasoning', id: `${block['id'] ?? ''}`, name: '', summary: '',
          status: '', duration: '', statusLabel: '', content: `${block['content'] ?? ''}`,
          durationMs: Number(block['durationMs'] ?? 0), streaming: false,
        }];
      }
      if (type === 'tool_activity') {
        return [{
          kind: 'tool', id: `${block['id'] ?? ''}`,
          name: `${block['toolName'] ?? block['name'] ?? ''}`,
          summary: `${block['summary'] ?? ''}`, status: `${block['status'] ?? ''}`,
          duration: `${block['elapsed'] ?? block['duration'] ?? ''}`, statusLabel: '',
          content: '', durationMs: 0, streaming: false,
        }];
      }
      if (type === 'text' && `${block['phase'] ?? ''}` === 'process') {
        return [{
          kind: 'text', id: `${block['id'] ?? ''}`, name: '', summary: '', status: '',
          duration: '', statusLabel: '', content: `${block['content'] ?? ''}`,
          durationMs: 0, streaming: false,
        }];
      }
      return [];
    });
  }

  private static mergeMessagePages(
    existing: PersistedMessageRow[],
    olderPage: PersistedMessageRow[],
  ): PersistedMessageRow[] {
    const byId = new Map<string, PersistedMessageRow>();
    for (const m of olderPage) {
      byId.set(m.id, m);
    }
    for (const m of existing) {
      byId.set(m.id, m);
    }
    return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private static followUpsFromDetail(detail: SessionDetailRow): import('../preview/PreviewModels').FollowUpRow[] {
    const rows: PendingUserInputRow[] = detail.pendingUserInputs ?? [];
    return rows.map((p) => ({ id: p.id, content: p.content }));
  }

  private static latestAssistantRunId(detail: SessionDetailRow): string | undefined {
    for (let i = detail.messages.length - 1; i >= 0; i--) {
      const msg = detail.messages[i];
      if (msg.role === 'assistant' && msg.runId !== undefined && `${msg.runId}`.length > 0) {
        return msg.runId;
      }
    }
    return undefined;
  }

  private static latestAssistantRunIdFromMessages(messages: PersistedMessageRow[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.runId !== undefined && `${msg.runId}`.length > 0) {
        return msg.runId;
      }
    }
    return undefined;
  }

  private runtimeActiveFor(sessionId: string): boolean {
    if (this.pendingSessions.has(sessionId)) {
      return true;
    }
    const live = this.liveRun;
    if (live && live.sessionId === sessionId && !HarmonyRunLiveReducer.isTerminal(live.deliveryStatus)) {
      return true;
    }
    return false;
  }

  private attachRunObserver(initial: LiveRunStateRow): void {
    if (this.observingRunId === initial.runId && this.sseBusy) {
      return;
    }
    this.runSseClient?.destroy();
    this.runSseClient = undefined;
    this.observingRunId = initial.runId;
    this.liveRun = initial;
    this.pendingSessions.add(initial.sessionId);
    this.emit(false);
    this.sseBusy = true;
    const sessionId = initial.sessionId;
    const runId = initial.runId;
    let live = initial;
    const finishTerminal = async (): Promise<void> => {
      this.pendingSessions.delete(sessionId);
      this.observingRunId = undefined;
      this.sseBusy = false;
      this.liveRun = live;
      this.emit(false);
      await this.refreshSessionList();
      await this.loadSessionDetail(sessionId, true);
      this.syncFollowUpAfterTerminal(sessionId);
    };
    HarnessAgentHttp.subscribeRunEvents(
      runId,
      live.cursor > 0 ? live.cursor : undefined,
      (event) => {
        if (event.seq <= live.cursor) {
          return;
        }
        if (event.seq > live.cursor + 1 && live.cursor > 0) {
          void HarnessAgentHttp.getJson<RunSnapshotRow>(`/api/agent/runs/${runId}`)
            .then((snap) => {
              live = this.reducer.applySnapshot(live, snap);
              this.liveRun = live;
              this.emit(false);
              if (HarmonyRunLiveReducer.isTerminal(live.deliveryStatus)) {
                void finishTerminal();
              }
            })
            .catch((err) => {
              this.handleHttpFailure(err);
            });
          return;
        }
        live = this.reducer.applyEvent(live, event);
        this.liveRun = live;
        this.emit(false);
      },
      async () => {
        if (HarmonyRunLiveReducer.isTerminal(live.deliveryStatus)) {
          await finishTerminal();
          return;
        }
        try {
          const snap = await HarnessAgentHttp.getJson<RunSnapshotRow>(`/api/agent/runs/${runId}`);
          live = this.reducer.applySnapshot(live, snap);
          this.liveRun = live;
          this.emit(false);
          if (HarmonyRunLiveReducer.isTerminal(live.deliveryStatus)) {
            await finishTerminal();
          }
        } catch (err) {
          this.sseBusy = false;
          this.handleHttpFailure(err);
        }
      },
      (message) => {
        this.sseBusy = false;
        this.handleHttpFailure(new Error(message));
      },
      (client) => {
        this.runSseClient = client;
      },
    );
  }

  private publishCreateRunFailure(sessionId: string, userText: string, detail: string): void {
    const title = this.summaries.find((s) => s.id === sessionId)?.title ?? userText.substring(0, 40);
    this.snapshot = {
      ...HarmonyCoreSessionMapper.emptyLanding(),
      fileName: sessionId,
      title,
      isLanding: false,
      lines: [
        { role: 'user', text: userText, process: [] },
        { role: 'assistant', text: detail, process: [] },
      ],
      composer: { ...this.snapshot.composer, submitting: false },
      workbench: this.snapshot.workbench,
      sessionDrawer: {
        ...this.snapshot.sessionDrawer,
        sessions: HarmonyCoreSessionMapper.drawerRows(
          this.summaries,
          sessionId,
          this.pendingSessions,
        ),
      },
    };
    this.emit(false);
  }
}
