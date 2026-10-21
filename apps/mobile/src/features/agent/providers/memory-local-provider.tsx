import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { memoryFixtures, type MemoryFixture } from '../fixtures/memory-fixtures';

type MemoryLocalContextValue = {
  memories: MemoryFixture[];
  upsertMemory: (memory: MemoryFixture) => void;
  deleteMemory: (memoryId: string) => void;
};

const MemoryLocalContext = createContext<MemoryLocalContextValue | null>(null);

export function MemoryLocalProvider({ children }: { children: ReactNode }) {
  const [memories, setMemories] = useState<MemoryFixture[]>(() => [...memoryFixtures]);

  const upsertMemory = useCallback((memory: MemoryFixture) => {
    setMemories((prev) => {
      const idx = prev.findIndex((m) => m.memoryId === memory.memoryId);
      if (idx === -1) return [memory, ...prev];
      const next = [...prev];
      next[idx] = memory;
      return next;
    });
  }, []);

  const deleteMemory = useCallback((memoryId: string) => {
    setMemories((prev) => prev.filter((m) => m.memoryId !== memoryId));
  }, []);

  const value = useMemo(
    () => ({ memories, upsertMemory, deleteMemory }),
    [memories, upsertMemory, deleteMemory],
  );

  return <MemoryLocalContext.Provider value={value}>{children}</MemoryLocalContext.Provider>;
}

export function useMemoryLocal(): MemoryLocalContextValue {
  const ctx = useContext(MemoryLocalContext);
  if (!ctx) throw new Error('useMemoryLocal must be used within MemoryLocalProvider');
  return ctx;
}
