export const MEMORY_POLICY_VERSION = 'c7-v1';

/** 与 migration `vector(N)` 列维度一致；改 env 前须同步 migration。 */
export const PGVECTOR_COLUMN_DIMENSIONS = 2560;

export const MEMORY_LIMITS = {
  titleMaxLength: 80,
  contentMaxLength: 500,
  defaultMaxCards: 8,
  defaultTokenBudget: 600,
  defaultRetrieveTopK: 32,
  defaultMinSimilarity: 0.32,
  defaultDedupThreshold: 0.92,
  defaultActiveCap: 50,
  defaultSmallSetInjectCap: 5,
  defaultSmallSetInject: true,
  embeddingTimeoutMs: 30_000,
  /** 在线记忆检索查询 embedding 超时上限，避免服务未启动或抖动时阻塞首字。 */
  queryEmbeddingTimeoutMs: 2_500,
  /** 查询 embedding 连续失败达到该次数后开启熔断。 */
  queryEmbedCircuitFailureThreshold: 2,
  /** 查询 embedding 熔断冷却时长（毫秒），冷却后自动半开探测。 */
  queryEmbedCircuitCooldownMs: 60_000,
} as const;

export const MEMORY_KINDS = [
  'preference',
  'workflow',
  'format',
  'correction',
  'identity_context',
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];
