import { AgentSessionPort } from '../port/AgentSessionPort';
import { PreviewSessionState } from '../preview/PreviewFixtureLoader';
import { PreviewFixtureDescriptor } from '../preview/PreviewFixtures';
import { HarmonyMobileEngine } from './HarmonyMobileEngine';

let sharedEngine: HarmonyMobileEngine | undefined = undefined;

function engine(): HarmonyMobileEngine {
  if (sharedEngine === undefined) {
    sharedEngine = new HarmonyMobileEngine();
  }
  return sharedEngine;
}

/** 连接检测等场景复用单例 engine，避免覆盖 Chat 页 onSnapshot。 */
export function getSharedHarmonyMobileEngine(): HarmonyMobileEngine {
  return engine();
}

/**
 * Phase B Core Port → [HarmonyMobileEngine]（薄 HTTP；NAPI mobile-core 后续替换）。
 */
export class CoreAgentSessionPort implements AgentSessionPort {
  sessionState: PreviewSessionState;
  private readonly core: HarmonyMobileEngine;
  onSessionStateChange: (state: PreviewSessionState) => void = () => {};

  constructor() {
    this.core = engine();
    this.sessionState = this.core.snapshot;
    this.core.onSnapshot = (next) => {
      this.sessionState = next;
      this.onSessionStateChange(next);
    };
  }

  loadPreviewFixture(_fileName: string): PreviewSessionState {
    throw new Error('CoreAgentSessionPort does not load preview fixtures');
  }

  listPreviewFixtures(): PreviewFixtureDescriptor[] {
    return [];
  }

  async refreshReadiness(): Promise<void> {
    await this.core.refreshReadiness();
  }

  async refreshPublicConfig(): Promise<void> {
    await this.core.refreshPublicConfig();
  }

  async refreshSessionList(): Promise<void> {
    await this.core.refreshSessionList();
  }

  async selectSession(sessionId: string): Promise<void> {
    await this.core.selectSession(sessionId);
  }

  async beginNewConversation(): Promise<void> {
    await this.core.beginNewConversation();
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.core.renameSession(sessionId, title);
  }

  async togglePinSession(sessionId: string): Promise<void> {
    await this.core.togglePinSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.core.deleteSession(sessionId);
  }

  addComposerSkill(skill: string): void {
    this.core.addComposerSkill(skill);
  }

  async uploadComposerAttachment(fileName: string, fileData: ArrayBuffer, mediaType: string): Promise<void> {
    await this.core.uploadComposerAttachment(fileName, fileData, mediaType);
  }

  async refreshSkillPicker(): Promise<void> {
    await this.core.refreshSkillPicker();
  }

  getComposerModelOptions(): { id: string; label: string; reasoningOptions: string[] }[] {
    return this.core.getComposerModelOptions();
  }

  getSkillPickerNames(): string[] {
    return this.core.getSkillPickerNames();
  }

  async submitComposerText(
    text: string,
    modelId?: string,
    reasoningEffort?: string,
    skillNames?: string[],
  ): Promise<void> {
    await this.core.submitComposer(text, modelId, reasoningEffort, skillNames);
  }

  async cancelActiveRun(): Promise<void> {
    await this.core.cancelActiveRun();
  }

  async sendPendingInput(inputId: string): Promise<void> {
    const active = this.sessionState.sessionDrawer.sessions.find((s) => s.active);
    if (active?.running) {
      await this.core.promotePendingInput(inputId);
      return;
    }
    await this.core.sendPendingInput(inputId);
  }

  async cancelPendingInput(inputId: string): Promise<void> {
    await this.core.cancelPendingInput(inputId);
  }

  async refreshWorkbench(): Promise<void> {
    await this.core.refreshWorkbench();
  }

  async openWorkbenchPanel(): Promise<void> {
    await this.core.openWorkbenchPanel(false);
  }

  async focusWorkbenchToolCall(runId: string, toolCallId: string): Promise<void> {
    await this.core.focusWorkbenchToolCall(runId, toolCallId);
  }

  setWorkbenchOpen(open: boolean): void {
    this.core.setWorkbenchOpen(open);
  }

  clearWorkbenchFocusHint(): void {
    this.core.clearWorkbenchFocusHint();
  }

  async loadOlderMessages(sessionId: string): Promise<void> {
    await this.core.loadOlderMessages(sessionId);
  }

  async bootstrapIfConfigured(): Promise<void> {
    await this.core.bootstrapIfConfigured();
  }

  async respondClarification(answer: string): Promise<void> {
    await this.core.respondClarification(answer);
  }

  async approveToolCalls(): Promise<void> {
    await this.core.approveToolCalls();
  }

  async rejectToolCalls(): Promise<void> {
    await this.core.rejectToolCalls();
  }

  onAppBackground(): void {
    this.core.onAppBackground();
  }

  async onAppForeground(): Promise<void> {
    await this.core.onAppForeground();
  }

  async restoreArtifactVersion(artifactId: string, expectedCurrentArtifactId: string): Promise<void> {
    await this.core.restoreArtifactVersion(artifactId, expectedCurrentArtifactId);
  }

  beginArtifactRevision(artifactId: string): void {
    this.core.beginArtifactRevision(artifactId);
  }

  clearComposerRevisionSeed(): void {
    this.core.clearComposerRevisionSeed();
  }
}
