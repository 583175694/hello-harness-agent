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
} as const;

export const MEMORY_KINDS = [
  'preference',
  'workflow',
  'format',
  'correction',
  'identity_context',
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];
