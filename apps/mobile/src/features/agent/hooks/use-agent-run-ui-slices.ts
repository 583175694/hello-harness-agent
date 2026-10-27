import { useContext, useSyncExternalStore } from 'react';

import { AgentRunUiStoreContext } from '../providers/agent-run-ui-store-context';
import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import type {
  AgentRunComposerSnapshot,
  AgentRunWorkbenchSnapshot,
} from '../model/agent-run-ui-store';
import type { ConnectionState } from '../components/connection-pill';

function useRunUiStore() {
  const store = useContext(AgentRunUiStoreContext);
  if (!store) {
    throw new Error('useAgentRunUiSlice must be used within AgentHostProvider');
  }
  return store;
}

function getConversationRenderEpoch(store: ReturnType<typeof useRunUiStore>): string {
  return `${store.getConversationStructureEpoch()}:${store.getConversationTailEpoch()}`;
}

export function useAgentHostConversation(): MobileConversationItem[] {
  const store = useRunUiStore();
  useSyncExternalStore(
    store.subscribeConversation,
    () => getConversationRenderEpoch(store),
    () => getConversationRenderEpoch(store),
  );
  return store.getConversation();
}

export function useAgentHostWorkbenchSnapshot(): AgentRunWorkbenchSnapshot {
  const store = useRunUiStore();
  return useSyncExternalStore(store.subscribeWorkbench, store.getWorkbench, store.getWorkbench);
}

export function useAgentHostComposerSnapshot(): AgentRunComposerSnapshot {
  const store = useRunUiStore();
  return useSyncExternalStore(store.subscribeComposer, store.getComposer, store.getComposer);
}

export function useAgentHostConnectionState(): ConnectionState {
  const store = useRunUiStore();
  return useSyncExternalStore(store.subscribeConnection, store.getConnection, store.getConnection);
}

/** Forces subscription to all run-ui slices (for legacy `useAgentHost` consumers). */
export function useAgentHostRunUiAllSlices(): void {
  useAgentHostConversation();
  useAgentHostWorkbenchSnapshot();
  useAgentHostComposerSnapshot();
  useAgentHostConnectionState();
}
