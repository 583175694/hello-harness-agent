import { Inject, Injectable, Logger } from '@nestjs/common';
import { describeLogError } from '../shared/logging.utils';
import { MEMORY_LIMITS } from './memory.constants';
import { MemoryConfigService } from './memory.config';
import { buildMemoryDocumentText, deterministicEmbedding } from './memory.utils';

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

@Injectable()
export class MemoryEmbeddingService {
  private readonly logger = new Logger(MemoryEmbeddingService.name);
  private consecutiveQueryFailures = 0;
  private queryCircuitOpenUntil = 0;

  constructor(@Inject(MemoryConfigService) private readonly config: MemoryConfigService) {}

  async embedDocument(title: string, summary: string): Promise<number[]> {
    return this.embedText(buildMemoryDocumentText(title, summary));
  }

  /** 在线检索专用：紧超时（2.5s）+ 连续失败轻量熔断（60s 冷却），避免服务未启时阻塞首字。 */
  async embedQuery(text: string): Promise<number[]> {
    const now = Date.now();
    if (now < this.queryCircuitOpenUntil) {
      throw new Error('EMBED_CIRCUIT_OPEN');
    }
    try {
      const vector = await this.embedText(text, {
        timeoutMs: MEMORY_LIMITS.queryEmbeddingTimeoutMs,
      });
      this.consecutiveQueryFailures = 0;
      this.queryCircuitOpenUntil = 0;
      return vector;
    } catch (error) {
      this.consecutiveQueryFailures += 1;
      if (this.consecutiveQueryFailures >= MEMORY_LIMITS.queryEmbedCircuitFailureThreshold) {
        this.queryCircuitOpenUntil = Date.now() + MEMORY_LIMITS.queryEmbedCircuitCooldownMs;
        this.logger.warn(
          `memory.query_embed.circuit_open | 连续失败=${this.consecutiveQueryFailures} | 冷却=${MEMORY_LIMITS.queryEmbedCircuitCooldownMs}ms`,
        );
      }
      throw error;
    }
  }

  async embedText(text: string, options?: { timeoutMs?: number }): Promise<number[]> {
    const mode = this.config.resolveEmbeddingMode();
    const dimensions = this.config.embeddingDimensions;
    if (mode === 'deterministic_dev') {
      return deterministicEmbedding(text, dimensions);
    }
    const baseUrl = this.config.embeddingBaseUrl;
    const apiKey = this.config.embeddingApiKey;
    if (!baseUrl || !apiKey) {
      throw new Error('MEMORY_EMBEDDING_NOT_CONFIGURED');
    }
    const timeoutMs = options?.timeoutMs ?? this.config.embeddingTimeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: text,
          ...(this.config.embeddingRequestDimensions ? { dimensions } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`EMBED_HTTP_${response.status}:${detail.slice(0, 200)}`);
      }
      const payload = (await response.json()) as EmbeddingResponse;
      const vector = payload.data?.[0]?.embedding;
      if (!vector?.length) {
        throw new Error('EMBED_INVALID_RESPONSE:empty');
      }
      if (vector.length !== dimensions) {
        throw new Error(
          `EMBED_INVALID_RESPONSE:dim=${vector.length},expected=${dimensions}`,
        );
      }
      return vector;
    } finally {
      clearTimeout(timeout);
    }
  }

  logQueryEmbedFailure(error: unknown): void {
    if (error instanceof Error && error.message === 'EMBED_CIRCUIT_OPEN') return;
    this.logger.warn(`memory.query_embed.failure | 原因=${describeLogError(error)}`);
  }
}
