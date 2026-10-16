import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MEMORY_LIMITS, PGVECTOR_COLUMN_DIMENSIONS } from './memory.constants';

export type MemoryEmbeddingMode = 'gateway' | 'deterministic_dev';

@Injectable()
export class MemoryConfigService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  get readEnabled(): boolean {
    return this.parseBool(this.config.get<string>('MEMORY_READ'), true);
  }

  get writeEnabled(): boolean {
    return this.parseBool(this.config.get<string>('MEMORY_WRITE'), true);
  }

  get minSimilarity(): number {
    return this.parseNumber(this.config.get<string>('MEMORY_MIN_SIMILARITY'), MEMORY_LIMITS.defaultMinSimilarity);
  }

  get retrieveTopK(): number {
    return this.parseInt(this.config.get<string>('MEMORY_RETRIEVE_TOP_K'), MEMORY_LIMITS.defaultRetrieveTopK);
  }

  get dedupThreshold(): number {
    return this.parseNumber(this.config.get<string>('MEMORY_DEDUP_THRESHOLD'), MEMORY_LIMITS.defaultDedupThreshold);
  }

  get activeCap(): number {
    return this.parseInt(this.config.get<string>('MEMORY_ACTIVE_CAP'), MEMORY_LIMITS.defaultActiveCap);
  }

  get smallSetInject(): boolean {
    return this.parseBool(this.config.get<string>('MEMORY_SMALL_SET_INJECT'), false);
  }

  get embeddingBaseUrl(): string | undefined {
    const raw = this.config.get<string>('MEMORY_EMBEDDING_BASE_URL')?.trim();
    return raw ? raw.replace(/\/+$/, '') : undefined;
  }

  get embeddingApiKey(): string | undefined {
    const raw = this.config.get<string>('MEMORY_EMBEDDING_API_KEY')?.trim();
    return raw || undefined;
  }

  get embeddingModel(): string {
    return this.config.get<string>('MEMORY_EMBEDDING_MODEL')?.trim() || 'kinfra-text-embedding-4b';
  }

  get embeddingDimensions(): number {
    return this.parseInt(this.config.get<string>('MEMORY_EMBEDDING_DIMENSIONS'), 2560);
  }

  /** 是否在 /embeddings 请求体里传 dimensions（kinfra 等模型不支持，须为 false）。 */
  get embeddingRequestDimensions(): boolean {
    return this.parseBool(this.config.get<string>('MEMORY_EMBEDDING_REQUEST_DIMENSIONS'), false);
  }

  get embeddingTimeoutMs(): number {
    return this.parseInt(this.config.get<string>('MEMORY_EMBEDDING_TIMEOUT_MS'), 30_000);
  }

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV') ?? 'development';
  }

  resolveEmbeddingMode(): MemoryEmbeddingMode {
    if (this.embeddingApiKey && this.embeddingBaseUrl) return 'gateway';
    if (this.nodeEnv === 'development' || this.nodeEnv === 'test') return 'deterministic_dev';
    return 'gateway';
  }

  assertProductionEmbeddingReady(): void {
    if (!this.readEnabled && !this.writeEnabled) return;
    if (this.nodeEnv === 'production' && this.resolveEmbeddingMode() !== 'gateway') {
      throw new Error(
        '生产环境启用 Memory 时必须配置 MEMORY_EMBEDDING_BASE_URL 与 MEMORY_EMBEDDING_API_KEY。',
      );
    }
    this.assertPgvectorColumnDimensions();
  }

  assertPgvectorColumnDimensions(): void {
    if (!this.readEnabled && !this.writeEnabled) return;
    if (this.embeddingDimensions !== PGVECTOR_COLUMN_DIMENSIONS) {
      throw new Error(
        `MEMORY_EMBEDDING_DIMENSIONS=${this.embeddingDimensions} 与数据库 pgvector(${PGVECTOR_COLUMN_DIMENSIONS}) 不一致，请对齐 migration 或 env。`,
      );
    }
  }

  private parseBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value === '') return fallback;
    return value === 'true' || value === '1';
  }

  private parseInt(value: string | undefined, fallback: number): number {
    if (value === undefined || value === '') return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private parseNumber(value: string | undefined, fallback: number): number {
    if (value === undefined || value === '') return fallback;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
