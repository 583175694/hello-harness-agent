import type { FileRef } from '@harness/agent-protocol';

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
  | 'fetch-failed'
  /** Preview：长会话滚动 / FlashList 压测 */
  | 'scroll-stress'
  | 'skills'
  | 'service-unavailable'
  | 'composer-peek'
  | 'memory-write-tool';

export type MobileAssistantBlock =
  | { type: 'text'; content: string }
  | {
      type: 'reasoning';
      content: string;
      durationMs?: number;
      streaming?: boolean;
      startedAt?: string;
      completedAt?: string;
    }
  | { type: 'tool_activity'; item: ToolActivityFixture }
  | {
      type: 'artifact';
      fileName: string;
      versionNumber?: number;
      fileKind?: string;
    }
  | { type: 'user_intervention'; content: string }
  | { type: 'chain_of_thought'; id: string };

export type MobileConversationItem =
  | {
      kind: 'user';
      id?: string;
      content: string;
      pendingState?: 'steer_pending' | 'steer_applied' | 'follow_up_pending';
      attachmentHint?: string;
      attachments?: FileRef[];
      skillNames?: string[];
    }
  | {
      kind: 'assistant';
      id?: string;
      deliveryStatus?: 'streaming' | 'completed' | 'failed' | 'cancelled';
      streaming?: boolean;
      errorDetail?: string;
      /** 执行过程（推理 / 工具 / 过程内文本），与 Web `presentation.process` 对齐 */
      process?: MobileAssistantBlock[];
      pendingText?: string;
      finalText?: string;
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
  selectedSkills?: string[];
  composerTextMode?: 'new-run' | 'steer' | 'clarification' | 'disabled';
};

export type MobileChromeFixture = {
  serviceState?: 'checking' | 'ready' | 'unavailable';
  connectionState?: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline';
  runSummary?: string;
  peekBarTitle?: string;
  peekBarSubtitle?: string;
};

export type MobileChatFixture = {
  title?: string;
  conversation: MobileConversationItem[];
  composer: MobileComposerFixture;
  chrome?: MobileChromeFixture;
  workbench?: {
    initialView?: WorkspaceView;
    initialSheetIndex?: number;
    workbenchCount?: number;
    /** 默认 `workbenchCount > 0`；无交付物时可显式 `false` 隐藏「文件」Tab */
    hasDeliverables?: boolean;
    /** 实时跟随主区展示来源列表（web_search / web_fetch） */
    activityEmphasis?: 'default' | 'sources';
  };
};
