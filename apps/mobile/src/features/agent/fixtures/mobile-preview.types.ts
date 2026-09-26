import type { WorkspaceView } from './ui-fixtures';
import type { ToolActivityFixture } from './ui-fixtures';

/** 与 Web `PreviewState` 对齐 */
export type MobilePreviewState =
  | 'empty'
  | 'direct-answer'
  | 'tool-running'
  | 'tool-running-open'
  | 'plan-running'
  | 'plan-completed'
  | 'reasoning'
  | 'artifacts'
  | 'attachments'
  | 'context-compacted'
  | 'sources'
  | 'final-report'
  | 'waiting'
  | 'steer-accepted'
  | 'steer-pending'
  | 'follow-up-pending'
  | 'queued'
  | 'pause-requested'
  | 'paused'
  | 'resuming'
  | 'clarification'
  | 'tool-approval'
  | 'final-answer'
  | 'cancel-requested'
  | 'cancelling'
  | 'cancelled'
  | 'limited-report'
  | 'failed'
  | 'fetch-running'
  | 'fetch-candidate'
  | 'fetch-failed';

export type MobileAssistantBlock =
  | { type: 'text'; content: string }
  | {
      type: 'reasoning';
      content: string;
      durationMs?: number;
      streaming?: boolean;
    }
  | { type: 'tool_activity'; item: ToolActivityFixture }
  | {
      type: 'artifact';
      fileName: string;
      versionNumber?: number;
      fileKind?: string;
    }
  | { type: 'user_intervention'; content: string };

export type MobileConversationItem =
  | {
      kind: 'user';
      content: string;
      pendingState?: 'steer_pending' | 'steer_applied' | 'follow_up_pending';
      attachmentHint?: string;
    }
  | {
      kind: 'assistant';
      deliveryStatus?: 'streaming' | 'completed' | 'failed' | 'cancelled';
      streaming?: boolean;
      errorDetail?: string;
      blocks: MobileAssistantBlock[];
      showQuickActions?: boolean;
    };

export type MobileComposerFixture = {
  mode?: 'default' | 'hitl' | 'clarification';
  showPlan?: boolean;
  showFollowUp?: boolean;
  followUpItems?: Array<{ id: string; content: string }>;
  showAttachmentSamples?: boolean;
  submitting?: boolean;
};

export type MobileChatFixture = {
  title?: string;
  conversation: MobileConversationItem[];
  composer: MobileComposerFixture;
  workbench?: {
    initialView?: WorkspaceView;
    initialSheetIndex?: number;
    workbenchCount?: number;
  };
};
