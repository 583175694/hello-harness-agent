import { cosineSimilarity, normalizeMemoryTitle } from './memory.utils';

export type MemoryDedupEntry = {
  memoryId: string;
  title: string;
  summary: string;
  embedding?: readonly number[];
};

export function findTitleDedupMatch(
  entries: readonly MemoryDedupEntry[],
  title: string,
): MemoryDedupEntry | undefined {
  const normalized = normalizeMemoryTitle(title);
  return entries.find((entry) => normalizeMemoryTitle(entry.title) === normalized);
}

export function findBestVectorMatch(
  entries: readonly MemoryDedupEntry[],
  vector: readonly number[],
  threshold: number,
  excludeMemoryId?: string,
): MemoryDedupEntry | undefined {
  let best: { entry: MemoryDedupEntry; score: number } | undefined;
  for (const entry of entries) {
    if (excludeMemoryId && entry.memoryId === excludeMemoryId) continue;
    if (!entry.embedding?.length) continue;
    const score = cosineSimilarity(vector, entry.embedding);
    if (!best || score > best.score) best = { entry, score };
  }
  if (best && best.score >= threshold) return best.entry;
  return undefined;
}

/** 与 keeper 语义足够接近的其它 active，写入成功后应 supersede。 */
export function findSimilarMemoryIds(
  entries: readonly MemoryDedupEntry[],
  vector: readonly number[],
  threshold: number,
  keeperMemoryId: string,
): string[] {
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry.memoryId === keeperMemoryId) continue;
    if (!entry.embedding?.length) continue;
    if (cosineSimilarity(vector, entry.embedding) >= threshold) ids.push(entry.memoryId);
  }
  return ids;
}
