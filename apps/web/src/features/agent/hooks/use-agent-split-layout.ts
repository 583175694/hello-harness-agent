import { useCallback, useMemo, useState } from 'react';

const STORAGE_KEY = 'pipishrimp.agent.split';

/** 会话区默认占比（0–100），与 docs/37 约 42% / 58% 对齐 */
export const DEFAULT_AGENT_SPLIT = { conversation: 42, workbench: 58 } as const;

function readStoredConversationPercent(): number {
  if (typeof window === 'undefined') return DEFAULT_AGENT_SPLIT.conversation;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_SPLIT.conversation;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return DEFAULT_AGENT_SPLIT.conversation;
    return Math.min(55, Math.max(32, value));
  } catch {
    return DEFAULT_AGENT_SPLIT.conversation;
  }
}

export function useAgentSplitLayout() {
  const [conversationPercent, setConversationPercent] = useState(readStoredConversationPercent);

  const defaultLayout = useMemo(
    () => ({ conversation: conversationPercent, workbench: 100 - conversationPercent }),
    [conversationPercent],
  );

  const onLayoutChanged = useCallback((layout: { conversation?: number; workbench?: number }) => {
    // react-resizable-panels 会附带 meta；此处只关心 layout 映射。
    const next = layout.conversation;
    if (next === undefined || !Number.isFinite(next)) return;
    const clamped = Math.min(55, Math.max(32, next));
    setConversationPercent(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      /* ignore quota */
    }
  }, []);

  return { defaultLayout, onLayoutChanged };
}
