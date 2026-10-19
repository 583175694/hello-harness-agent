import { Inject, Injectable, Logger } from '@nestjs/common';
import { getDeepSeekV3TokenEstimator } from '@harness/deepseek-v3-tokenizer';
import { MEMORY_LIMITS } from './memory.constants';
import { MemoryConfigService } from './memory.config';
import { MemoryEmbeddingService } from './memory.embedding.service';
import { MemoryRepository } from './memory.repository';
import { MemoryVectorRepository } from './memory.vector.repository';
import { evaluateMemoryRetrievalGate } from './memory.retrieval.gate';
import type {
  MemoryCard,
  MemoryInjectionTrace,
  MemoryRetrievalRequest,
  MemoryRetrievalResult,
  MemorySourceRef,
} from './memory.types';

const IMPORTANCE_RANK = { high: 3, medium: 2, low: 1 } as const;
const FRESHNESS_RANK = { fresh: 3, unknown: 2, stale: 1 } as const;
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 } as const;

@Injectable()
export class MemoryRetrieverService {
  private readonly logger = new Logger(MemoryRetrieverService.name);
  private readonly estimator = getDeepSeekV3TokenEstimator();

  constructor(
    @Inject(MemoryConfigService) private readonly config: MemoryConfigService,
    @Inject(MemoryEmbeddingService) private readonly embedding: MemoryEmbeddingService,
    @Inject(MemoryVectorRepository) private readonly vectors: MemoryVectorRepository,
    @Inject(MemoryRepository) private readonly repository: MemoryRepository,
  ) {}

  async retrieve(request: MemoryRetrievalRequest): Promise<MemoryRetrievalResult | null> {
    if (!this.config.readEnabled) return null;
    const query = request.query.trim();
    if (!query) return null;

    const stepId = crypto.randomUUID();
    const trace: MemoryInjectionTrace = {
      runId: request.runId,
      stepId,
      includedMemoryIds: [],
      omitted: [],
      tokenEstimate: 0,
    };

    let queryVector: number[];
    try {
      const cached = request.queryEmbedCache?.get(query);
      if (cached?.length) {
        queryVector = cached;
      } else {
        queryVector = await this.embedding.embedText(query);
        request.queryEmbedCache?.set(query, queryVector);
      }
    } catch (error) {
      this.embedding.logQueryEmbedFailure(error);
      trace.queryEmbedFailed = true;
      this.logTrace(trace);
      return { cards: [], trace };
    }

    const topK = request.retrieveTopK ?? this.config.retrieveTopK;
    const hits = await this.vectors.searchTopK(request.userId, queryVector, topK);
    const minSimilarity = request.minSimilarity ?? this.config.minSimilarity;
    const activeCount = await this.repository.countActive(request.userId);
    const bypassThreshold =
      this.config.smallSetInject && activeCount <= MEMORY_LIMITS.defaultSmallSetInjectCap;

    const gated: Array<{ hit: (typeof hits)[number]; similarity: number }> = [];
    for (const hit of hits) {
      const gate = evaluateMemoryRetrievalGate({
        memoryId: hit.memoryId,
        kind: hit.kind,
        embeddingModel: hit.embeddingModel,
        configuredEmbeddingModel: this.config.embeddingModel,
        sensitivity: hit.sensitivity,
        policy: hit.policy,
        freshness: hit.freshness,
        sourceRefs: hit.sourceRefs,
        similarity: hit.similarity,
        minSimilarity,
        bypassThreshold,
        includeStale: request.includeStale,
        kinds: request.kinds,
      });
      if (gate.ok) gated.push({ hit, similarity: hit.similarity });
      else trace.omitted.push({ memoryId: hit.memoryId, reason: gate.reason });
    }

    gated.sort((left, right) => {
      if (right.similarity !== left.similarity) return right.similarity - left.similarity;
      const imp =
        IMPORTANCE_RANK[right.hit.importance as keyof typeof IMPORTANCE_RANK] -
        IMPORTANCE_RANK[left.hit.importance as keyof typeof IMPORTANCE_RANK];
      if (imp !== 0) return imp;
      const fresh =
        FRESHNESS_RANK[right.hit.freshness as keyof typeof FRESHNESS_RANK] -
        FRESHNESS_RANK[left.hit.freshness as keyof typeof FRESHNESS_RANK];
      if (fresh !== 0) return fresh;
      return (
        CONFIDENCE_RANK[right.hit.confidence as keyof typeof CONFIDENCE_RANK] -
        CONFIDENCE_RANK[left.hit.confidence as keyof typeof CONFIDENCE_RANK]
      );
    });

    const maxCards = request.maxCards ?? MEMORY_LIMITS.defaultMaxCards;
    const tokenBudget = request.tokenBudget ?? MEMORY_LIMITS.defaultTokenBudget;
    const cards: MemoryCard[] = [];
    let tokensUsed = 0;
    const includedSimilarities: Record<string, number> = {};

    for (const entry of gated) {
      if (cards.length >= maxCards) {
        trace.omitted.push({ memoryId: entry.hit.memoryId, reason: 'max_cards' });
        continue;
      }
      const content = `${entry.hit.title}\n${entry.hit.summary}`;
      const tokens = await this.estimator.countText(content);
      if (tokensUsed + tokens > tokenBudget) {
        trace.omitted.push({ memoryId: entry.hit.memoryId, reason: 'budget' });
        continue;
      }
      tokensUsed += tokens;
      cards.push({
        memoryId: entry.hit.memoryId,
        title: entry.hit.title,
        summary: entry.hit.summary,
        similarity: entry.similarity,
        kind: entry.hit.kind,
        sourceRefs: Array.isArray(entry.hit.sourceRefs)
          ? (entry.hit.sourceRefs as MemorySourceRef[])
          : [],
      });
      includedSimilarities[entry.hit.memoryId] = entry.similarity;
    }

    trace.includedMemoryIds = cards.map((card) => card.memoryId);
    trace.includedSimilarities = includedSimilarities;
    trace.tokenEstimate = tokensUsed;
    this.logTrace(trace);

    if (cards.length) {
      void this.repository.touchUsage(cards.map((card) => card.memoryId));
    }

    return { cards, trace };
  }

  private logTrace(trace: MemoryInjectionTrace): void {
    this.logger.log({
      event: 'memory.injection.trace',
      runId: trace.runId,
      stepId: trace.stepId,
      includedMemoryIds: trace.includedMemoryIds,
      omitted: trace.omitted,
      tokenEstimate: trace.tokenEstimate,
      queryEmbedFailed: trace.queryEmbedFailed ?? false,
    });
  }
}
