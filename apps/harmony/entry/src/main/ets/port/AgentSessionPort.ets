import { PreviewSessionState } from '../preview/PreviewFixtureLoader';
import { PreviewFixtureDescriptor } from '../preview/PreviewFixtures';

/** Phase A/B 共用语义；Preview / Core 分实现（对齐 Android AgentSessionPort.kt）。 */
export interface AgentSessionPort {
  readonly sessionState: PreviewSessionState;
  loadPreviewFixture(fileName: string): PreviewSessionState;
  listPreviewFixtures(): PreviewFixtureDescriptor[];
  refreshReadiness?(): Promise<void>;
  refreshPublicConfig?(): Promise<void>;
  refreshSessionList?(): Promise<void>;
  selectSession?(sessionId: string): Promise<void>;
  beginNewConversation?(): Promise<void>;
  renameSession?(sessionId: string, title: string): Promise<void>;
  togglePinSession?(sessionId: string): Promise<void>;
  deleteSession?(sessionId: string): Promise<void>;
  submitComposerText?(text: string, modelId?: string, reasoningEffort?: string, skillNames?: string[]): Promise<void>;
  addComposerSkill?(skill: string): void;
  uploadComposerAttachment?(fileName: string, fileData: ArrayBuffer, mediaType: string): Promise<void>;
  cancelActiveRun?(): Promise<void>;
  sendPendingInput?(inputId: string): Promise<void>;
  cancelPendingInput?(inputId: string): Promise<void>;
  refreshWorkbench?(): Promise<void>;
  openWorkbenchPanel?(): Promise<void>;
  focusWorkbenchToolCall?(runId: string, toolCallId: string): Promise<void>;
  setWorkbenchOpen?(open: boolean): void;
  clearWorkbenchFocusHint?(): void;
  loadOlderMessages?(sessionId: string): Promise<void>;
  respondClarification?(answer: string): Promise<void>;
  approveToolCalls?(): Promise<void>;
  rejectToolCalls?(): Promise<void>;
  onAppBackground?(): void;
  onAppForeground?(): Promise<void>;
  restoreArtifactVersion?(artifactId: string, expectedCurrentArtifactId: string): Promise<void>;
  beginArtifactRevision?(artifactId: string): void;
  clearComposerRevisionSeed?(): void;
}
