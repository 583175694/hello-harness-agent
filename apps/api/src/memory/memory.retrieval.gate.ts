import type { MemoryRecordPolicy } from './memory.types';

export type MemoryRetrievalGateInput = {
  memoryId: string;
  kind: string;
  embeddingModel: string | null;
  configuredEmbeddingModel: string;
  sensitivity: string;
  policy: unknown;
  freshness: string;
  sourceRefs: unknown;
  similarity: number;
  minSimilarity: number;
  bypassThreshold: boolean;
  includeStale?: boolean;
  kinds?: readonly string[];
};

export function evaluateMemoryRetrievalGate(
  hit: MemoryRetrievalGateInput,
): { ok: true } | { ok: false; reason: string } {
  if (hit.sensitivity === 'secret_suspected') return { ok: false, reason: 'secret' };
  const refs = Array.isArray(hit.sourceRefs) ? hit.sourceRefs : [];
  if (!refs.length) return { ok: false, reason: 'missing_source_refs' };
  if (!hit.embeddingModel || hit.embeddingModel !== hit.configuredEmbeddingModel) {
    return { ok: false, reason: 'missing_embedding' };
  }
  const policy = (hit.policy ?? {}) as MemoryRecordPolicy;
  if (policy.allowAutoInject === false) return { ok: false, reason: 'policy_disabled' };
  if (!hit.includeStale && hit.freshness === 'stale') return { ok: false, reason: 'stale' };
  if (hit.kinds?.length && !hit.kinds.includes(hit.kind)) {
    return { ok: false, reason: 'kind_filter' };
  }
  if (!hit.bypassThreshold && hit.similarity < hit.minSimilarity) {
    return { ok: false, reason: 'below_min_similarity' };
  }
  return { ok: true };
}
