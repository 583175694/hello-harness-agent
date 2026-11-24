import { afterEach, describe, expect, it, vi } from 'vitest';
import { MEMORY_LIMITS } from '../../../src/memory/memory.constants';
import { MemoryEmbeddingService } from '../../../src/memory/memory.embedding.service';

function createService() {
  const config = {
    resolveEmbeddingMode: () => 'remote' as const,
    embeddingDimensions: 2,
    embeddingBaseUrl: 'http://127.0.0.1:9999/v1',
    embeddingApiKey: 'test-key',
    embeddingModel: 'test-embed',
    embeddingRequestDimensions: false,
    embeddingTimeoutMs: MEMORY_LIMITS.embeddingTimeoutMs,
  };
  return new MemoryEmbeddingService(config as never);
}

describe('MemoryEmbeddingService.embedQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens circuit after 2 consecutive failures and recovers after cooldown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00.000Z'));

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.5, 0.5] }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const service = createService();

    // 前 2 次真实请求失败后开启熔断。
    await expect(service.embedQuery('q1')).rejects.toThrow('ECONNREFUSED');
    await expect(service.embedQuery('q2')).rejects.toThrow('ECONNREFUSED');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 冷却期内直接 0ms 熔断，不再发 fetch。
    await expect(service.embedQuery('q3')).rejects.toThrow('EMBED_CIRCUIT_OPEN');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 冷却期结束后自动半开探测并恢复正常。
    vi.advanceTimersByTime(MEMORY_LIMITS.queryEmbedCircuitCooldownMs + 1);
    await expect(service.embedQuery('q4')).resolves.toEqual([0.5, 0.5]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses tight queryEmbeddingTimeoutMs instead of 30s write timeout', async () => {
    const service = createService();
    const embedSpy = vi.spyOn(service, 'embedText').mockResolvedValue([0.1, 0.2]);

    await expect(service.embedQuery('hello')).resolves.toEqual([0.1, 0.2]);
    expect(embedSpy).toHaveBeenCalledWith('hello', {
      timeoutMs: MEMORY_LIMITS.queryEmbeddingTimeoutMs,
    });
  });
});
