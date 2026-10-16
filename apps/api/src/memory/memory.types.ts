import type { MemoryKind } from './memory.constants';

export type MemoryStatus =
  | 'candidate'
  | 'active'
  | 'superseded'
  | 'rejected'
  | 'expired';

export type MemorySourceRef = {
  refType: 'message' | 'session' | 'run';
  refId: string;
  userId: string;
  sessionId: string;
  runId?: string;
  relation: 'source';
};

export type MemoryRecordPolicy = {
  allowAutoInject: boolean;
  allowUseInWorker: boolean;
};

export type MemoryProvenance = {
  sourceSessionId: string;
  sourceRunId?: string;
  sourceToolCallId?: string;
  writer: 'memory_write' | 'settings' | 'candidate_accept';
  policyVersion: string;
  indexingFailed?: boolean;
};

export type MemoryRecordDomain = {
  memoryId: string;
  userId: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  status: MemoryStatus;
  confidence: 'low' | 'medium' | 'high';
  freshness: 'fresh' | 'stale' | 'unknown';
  importance: 'low' | 'medium' | 'high';
  sensitivity: 'normal' | 'private' | 'secret_suspected';
  sourceRefs: MemorySourceRef[];
  policy: MemoryRecordPolicy;
  provenance: MemoryProvenance;
  supersedesMemoryId?: string;
  embeddingModel?: string;
  embeddedAt?: string;
  embedding?: number[];
  lastUsedAt?: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MemoryWriteAction = 'create' | 'update' | 'delete';

export type MemoryWriteInput = {
  action: MemoryWriteAction;
  memoryId?: string;
  title?: string;
  content?: string;
  kind?: MemoryKind;
  storageIntent?: 'explicit' | 'inferred';
  confidence?: 'low' | 'medium' | 'high';
};

export type MemoryWriteOutput = {
  ok: boolean;
  action: MemoryWriteAction;
  memoryId?: string;
  status: 'active' | 'candidate' | 'rejected' | 'expired';
  reason?: string;
  indexingStatus?: 'ready' | 'pending' | 'failed';
};

export type MemoryInjectionTrace = {
  runId: string;
  stepId: string;
  includedMemoryIds: string[];
  includedSimilarities?: Record<string, number>;
  omitted: Array<{ memoryId?: string; reason: string }>;
  tokenEstimate: number;
  queryEmbedFailed?: boolean;
};

export type MemoryRetrievalRequest = {
  userId: string;
  sessionId: string;
  runId: string;
  query: string;
  kinds?: MemoryKind[];
  maxCards?: number;
  tokenBudget?: number;
  retrieveTopK?: number;
  minSimilarity?: number;
  includeStale?: boolean;
  /** 同一 Run 内复用 query 向量，避免多轮 tool loop 重复 embed。 */
  queryEmbedCache?: Map<string, number[]>;
};

export type MemoryCard = {
  memoryId: string;
  title: string;
  summary: string;
  similarity: number;
  kind: MemoryKind;
  sourceRefs: MemorySourceRef[];
};

export type MemoryRetrievalResult = {
  cards: MemoryCard[];
  trace: MemoryInjectionTrace;
};
