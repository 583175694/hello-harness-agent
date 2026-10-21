import { useMemo } from 'react';
import {
  useDefaultLayout,
  type Layout,
  type LayoutChangedMeta,
  type LayoutStorage,
} from 'react-resizable-panels';

const STORAGE_KEY = 'pipishrimp.agent.split';
export const AGENT_SPLIT_GROUP_ID = 'pipishrimp-agent-split';
export const AGENT_SPLIT_PANEL_IDS = ['conversation', 'workbench'] as const;

/** 会话区默认占比（0–100），默认 4:6（对话 40% / Workbench 60%） */
export const DEFAULT_AGENT_SPLIT = { conversation: 40, workbench: 60 } as const;

export function clampConversationPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AGENT_SPLIT.conversation;
  return Math.min(55, Math.max(32, value));
}

function layoutFromConversationPercent(conversation: number): Layout {
  const clamped = clampConversationPercent(conversation);
  return { conversation: clamped, workbench: 100 - clamped };
}

function readStoredConversationPercent(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return null;
    return clampConversationPercent(value);
  } catch {
    return null;
  }
}

/** 与 pipishrimp.agent.split 单值存储对齐，供 react-resizable-panels 读写完整 layout。 */
export const agentSplitLayoutStorage: LayoutStorage = {
  getItem(_key) {
    const conversation = readStoredConversationPercent();
    if (conversation === null) return null;
    return JSON.stringify(layoutFromConversationPercent(conversation));
  },
  setItem(_key, value) {
    if (typeof window === 'undefined') return;
    try {
      const layout = JSON.parse(value) as Layout;
      const next = layout.conversation;
      if (next === undefined || !Number.isFinite(next)) return;
      window.localStorage.setItem(STORAGE_KEY, String(clampConversationPercent(next)));
    } catch {
      /* ignore */
    }
  },
};

export function useAgentSplitLayout() {
  const { defaultLayout: persistedLayout, onLayoutChanged: persistLayout } = useDefaultLayout({
    id: AGENT_SPLIT_GROUP_ID,
    panelIds: [...AGENT_SPLIT_PANEL_IDS],
    storage: agentSplitLayoutStorage,
    onlySaveAfterUserInteractions: true,
  });

  const defaultLayout = useMemo(
    () =>
      persistedLayout ??
      layoutFromConversationPercent(readStoredConversationPercent() ?? DEFAULT_AGENT_SPLIT.conversation),
    [persistedLayout],
  );

  const onLayoutChanged = (layout: Layout, meta: LayoutChangedMeta) => {
    persistLayout(layout, meta);
  };

  return { defaultLayout, onLayoutChanged };
}
