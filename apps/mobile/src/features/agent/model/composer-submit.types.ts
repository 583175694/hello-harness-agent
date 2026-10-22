import type { FileRef, ReasoningEffort } from '@harness/agent-protocol';

export type ComposerSubmitPayload = {
  content: string;
  modelId: string;
  reasoningEffort: ReasoningEffort;
  skillNames?: string[];
  attachmentIds?: string[];
  /** 乐观 UI：发送后立即在对话区展示附件（Composer 清空后仍可用）。 */
  optimisticAttachments?: FileRef[];
  artifactVersionContext?: {
    seriesId: string;
    baseArtifactId: string;
    expectedCurrentArtifactId: string;
    changeSummary?: string;
  };
};
