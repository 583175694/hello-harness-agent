import type { WorkbenchState } from '@harness/agent-ui-types';
import type { PendingInterruptSnapshot, ReasoningEffort } from '@harness/agent-protocol';

import type { ConnectionState } from '../components/connection-pill';
import type { ModelFixture } from '../components/composer-model-menu';
import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import type { SessionComposerBlock } from '../lib/session-composer-block';

export type AgentRunWorkbenchSnapshot = {
  workbench?: WorkbenchState;
  workbenchReportId?: string;
  workbenchCount: number;
  hasDeliverables: boolean;
  activityEmphasis: 'default' | 'sources';
  activeRunId: string | null;
};

export type AgentRunComposerSnapshot = {
  runSubmitting: boolean;
  defaultModelId: string | null;
  defaultReasoningEffort: ReasoningEffort;
  composerModels: ModelFixture[];
  composerPlan?: { step: string; status: 'pending' | 'in_progress' | 'completed' }[];
  composerPlanExplanation?: string;
  followUpItems: { id: string; content: string }[];
  followUpSubmittingId: string | null;
  composerRevisionSeed: string | null;
  composerBlock: SessionComposerBlock | null;
  activeInterrupt: PendingInterruptSnapshot | null;
  hitlSubmitting: boolean;
};

type Listener = () => void;

const EMPTY_COMPOSER: AgentRunComposerSnapshot = {
  runSubmitting: false,
  defaultModelId: null,
  defaultReasoningEffort: 'high',
  composerModels: [],
  followUpItems: [],
  followUpSubmittingId: null,
  composerRevisionSeed: null,
  composerBlock: null,
  activeInterrupt: null,
  hitlSubmitting: false,
};

const EMPTY_WORKBENCH: AgentRunWorkbenchSnapshot = {
  workbenchCount: 0,
  hasDeliverables: false,
  activityEmphasis: 'default',
  activeRunId: null,
};

export type AgentRunUiStore = {
  subscribeConversation: (listener: Listener) => () => void;
  getConversation: () => MobileConversationItem[];
  subscribeWorkbench: (listener: Listener) => () => void;
  getWorkbench: () => AgentRunWorkbenchSnapshot;
  subscribeComposer: (listener: Listener) => () => void;
  getComposer: () => AgentRunComposerSnapshot;
  subscribeConnection: (listener: Listener) => () => void;
  getConnection: () => ConnectionState;
  publishConversation: (conversation: MobileConversationItem[]) => void;
  publishWorkbench: (snapshot: AgentRunWorkbenchSnapshot) => void;
  publishComposer: (snapshot: AgentRunComposerSnapshot) => void;
  publishConnection: (connection: ConnectionState) => void;
  publishAll: (input: {
    conversation: MobileConversationItem[];
    workbench: AgentRunWorkbenchSnapshot;
    composer: AgentRunComposerSnapshot;
    connection: ConnectionState;
  }) => void;
};

export function createAgentRunUiStore(): AgentRunUiStore {
  let conversation: MobileConversationItem[] = [];
  let workbench: AgentRunWorkbenchSnapshot = EMPTY_WORKBENCH;
  let composer: AgentRunComposerSnapshot = EMPTY_COMPOSER;
  let connection: ConnectionState = 'idle';

  const conversationListeners = new Set<Listener>();
  const workbenchListeners = new Set<Listener>();
  const composerListeners = new Set<Listener>();
  const connectionListeners = new Set<Listener>();

  return {
    subscribeConversation(listener) {
      conversationListeners.add(listener);
      return () => conversationListeners.delete(listener);
    },
    getConversation: () => conversation,
    subscribeWorkbench(listener) {
      workbenchListeners.add(listener);
      return () => workbenchListeners.delete(listener);
    },
    getWorkbench: () => workbench,
    subscribeComposer(listener) {
      composerListeners.add(listener);
      return () => composerListeners.delete(listener);
    },
    getComposer: () => composer,
    subscribeConnection(listener) {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    getConnection: () => connection,
    publishConversation(next) {
      if (next === conversation) return;
      conversation = next;
      conversationListeners.forEach((listener) => listener());
    },
    publishWorkbench(next) {
      if (
        next.workbench === workbench.workbench &&
        next.workbenchReportId === workbench.workbenchReportId &&
        next.workbenchCount === workbench.workbenchCount &&
        next.hasDeliverables === workbench.hasDeliverables &&
        next.activityEmphasis === workbench.activityEmphasis &&
        next.activeRunId === workbench.activeRunId
      ) {
        return;
      }
      workbench = next;
      workbenchListeners.forEach((listener) => listener());
    },
    publishComposer(next) {
      if (
        next.runSubmitting === composer.runSubmitting &&
        next.defaultModelId === composer.defaultModelId &&
        next.defaultReasoningEffort === composer.defaultReasoningEffort &&
        next.composerModels === composer.composerModels &&
        next.composerPlan === composer.composerPlan &&
        next.composerPlanExplanation === composer.composerPlanExplanation &&
        next.followUpItems === composer.followUpItems &&
        next.followUpSubmittingId === composer.followUpSubmittingId &&
        next.composerRevisionSeed === composer.composerRevisionSeed &&
        next.composerBlock === composer.composerBlock &&
        next.activeInterrupt === composer.activeInterrupt &&
        next.hitlSubmitting === composer.hitlSubmitting
      ) {
        return;
      }
      composer = next;
      composerListeners.forEach((listener) => listener());
    },
    publishConnection(next) {
      if (next === connection) return;
      connection = next;
      connectionListeners.forEach((listener) => listener());
    },
    publishAll(input) {
      this.publishConnection(input.connection);
      this.publishComposer(input.composer);
      this.publishWorkbench(input.workbench);
      this.publishConversation(input.conversation);
    },
  };
}
