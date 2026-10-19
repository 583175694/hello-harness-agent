import { describe, expect, it } from 'vitest';
import { evaluateMemoryRetrievalGate } from '../../../src/memory/memory.retrieval.gate';

const baseHit = {
  memoryId: 'm1',
  kind: 'preference',
  embeddingModel: 'embed-model',
  configuredEmbeddingModel: 'embed-model',
  sensitivity: 'normal',
  policy: { allowAutoInject: true, allowUseInWorker: false },
  freshness: 'fresh',
  sourceRefs: [{ refType: 'message', refId: 'msg-1' }],
  similarity: 0.5,
  minSimilarity: 0.32,
  bypassThreshold: false,
};

describe('evaluateMemoryRetrievalGate', () => {
  it('rejects below min similarity unless bypassed', () => {
    expect(
      evaluateMemoryRetrievalGate({ ...baseHit, similarity: 0.1 }),
    ).toEqual({ ok: false, reason: 'below_min_similarity' });
    expect(
      evaluateMemoryRetrievalGate({ ...baseHit, similarity: 0.1, bypassThreshold: true }),
    ).toEqual({ ok: true });
  });

  it('rejects stale and wrong embedding model', () => {
    expect(
      evaluateMemoryRetrievalGate({ ...baseHit, freshness: 'stale' }),
    ).toEqual({ ok: false, reason: 'stale' });
    expect(
      evaluateMemoryRetrievalGate({ ...baseHit, embeddingModel: 'other' }),
    ).toEqual({ ok: false, reason: 'missing_embedding' });
  });
});
