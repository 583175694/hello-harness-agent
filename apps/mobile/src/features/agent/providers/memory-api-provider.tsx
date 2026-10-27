import type { MemoryRecordView } from '@harness/agent-protocol';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAgentHostSession } from '../hooks/use-agent-host';

type MemoryApiContextValue = {
  memories: MemoryRecordView[];
  activeCount: number;
  loading: boolean;
  error: string | null;
  allowAgentWrite: boolean;
  settingsLoading: boolean;
  refresh: () => Promise<void>;
  saveMemory: (input: {
    memoryId?: string;
    kind: string;
    title: string;
    content: string;
  }) => Promise<void>;
  deleteMemory: (memoryId: string) => Promise<void>;
  setAllowAgentWrite: (value: boolean) => Promise<void>;
};

const MemoryApiContext = createContext<MemoryApiContextValue | null>(null);

export function MemoryApiProvider({ children }: { children: ReactNode }) {
  const { client, serviceState } = useAgentHostSession();
  const [memories, setMemories] = useState<MemoryRecordView[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowAgentWrite, setAllowAgentWriteState] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (serviceState !== 'ready') {
      setMemories([]);
      setActiveCount(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, settings] = await Promise.all([
        client.listMemories(),
        client.readMemorySettings(),
      ]);
      setMemories(list.memories);
      setActiveCount(list.activeCount);
      setAllowAgentWriteState(settings.allowAgentWrite);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '加载记忆失败');
    } finally {
      setLoading(false);
    }
  }, [client, serviceState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveMemory = useCallback(
    async (input: { memoryId?: string; kind: string; title: string; content: string }) => {
      if (input.memoryId) {
        await client.updateMemory(input.memoryId, {
          kind: input.kind,
          title: input.title,
          content: input.content,
        });
      } else {
        await client.createMemory({
          kind: input.kind,
          title: input.title,
          content: input.content,
        });
      }
      await refresh();
    },
    [client, refresh],
  );

  const deleteMemory = useCallback(
    async (memoryId: string) => {
      await client.deleteMemory(memoryId);
      await refresh();
    },
    [client, refresh],
  );

  const setAllowAgentWrite = useCallback(
    async (value: boolean) => {
      setSettingsLoading(true);
      try {
        const settings = await client.patchMemorySettings({ allowAgentWrite: value });
        setAllowAgentWriteState(settings.allowAgentWrite);
      } finally {
        setSettingsLoading(false);
      }
    },
    [client],
  );

  const value = useMemo(
    () => ({
      memories,
      activeCount,
      loading,
      error,
      allowAgentWrite,
      settingsLoading,
      refresh,
      saveMemory,
      deleteMemory,
      setAllowAgentWrite,
    }),
    [
      memories,
      activeCount,
      loading,
      error,
      allowAgentWrite,
      settingsLoading,
      refresh,
      saveMemory,
      deleteMemory,
      setAllowAgentWrite,
    ],
  );

  return <MemoryApiContext.Provider value={value}>{children}</MemoryApiContext.Provider>;
}

export function useMemoryApi(): MemoryApiContextValue {
  const ctx = useContext(MemoryApiContext);
  if (!ctx) throw new Error('useMemoryApi must be used within MemoryApiProvider');
  return ctx;
}
