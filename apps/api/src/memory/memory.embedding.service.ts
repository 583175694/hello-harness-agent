import { Inject, Injectable, Logger } from '@nestjs/common';
import { describeLogError } from '../shared/logging.utils';
import { MemoryConfigService } from './memory.config';
import { buildMemoryDocumentText, deterministicEmbedding } from './memory.utils';

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

@Injectable()
export class MemoryEmbeddingService {
  private readonly logger = new Logger(MemoryEmbeddingService.name);

  constructor(@Inject(MemoryConfigService) private readonly config: MemoryConfigService) {}

  async embedDocument(title: string, summary: string): Promise<number[]> {
    return this.embedText(buildMemoryDocumentText(title, summary));
  }

  async embedText(text: string): Promise<number[]> {
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.embeddingTimeoutMs);
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
    this.logger.warn(`memory.query_embed.failure | 原因=${describeLogError(error)}`);
  }
}
