import { describe, expect, it, vi } from 'vitest';
import { MemoryRetrieverService } from '../../../src/memory/memory.retriever.service';

describe('MemoryRetrieverService', () => {
  it('reuses query embed cache within the same run', async () => {
    const embedText = vi.fn().mockResolvedValue([0.1, 0.2]);
    const config = {
      readEnabled: true,
      retrieveTopK: 8,
      minSimilarity: 0.32,
      embeddingModel: 'm1',
      smallSetInject: false,
    };
    const embedding = { embedText, logQueryEmbedFailure: vi.fn() };
    const vectors = { searchTopK: vi.fn().mockResolvedValue([]) };
    const repository = { countActive: vi.fn().mockResolvedValue(0), touchUsage: vi.fn() };
    const service = new MemoryRetrieverService(
      config as never,
      embedding as never,
      vectors as never,
      repository as never,
    );
    const cache = new Map<string, number[]>();
    const request = {
      userId: 'u1',
      sessionId: 's1',
      runId: 'r1',
      query: '你好',
      queryEmbedCache: cache,
    };
    await service.retrieve(request);
    await service.retrieve(request);
    expect(embedText).toHaveBeenCalledTimes(1);
    expect(cache.get('你好')).toEqual([0.1, 0.2]);
  });
});
