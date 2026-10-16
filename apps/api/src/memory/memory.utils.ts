import { createHash } from 'node:crypto';
import type { MemorySourceRef as ContextMemorySourceRef } from '../context-engineering/context-engineering.types';
import type { MemorySourceRef as StoredMemorySourceRef } from './memory.types';

export function buildMemoryDocumentText(title: string, summary: string): string {
  return `${title.trim()}\n${summary.trim()}`;
}

export function composeMemoryRetrievalQuery(lastUser?: string, prevUser?: string): string {
  const parts = [lastUser?.trim(), prevUser?.trim()].filter((value) => value && value.length > 0);
  return parts.join('\n');
}

export function normalizeMemoryTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function deterministicEmbedding(text: string, dimensions: number): number[] {
  const seed = createHash('sha256').update(text).digest();
  const vector: number[] = [];
  for (let index = 0; index < dimensions; index += 1) {
    const byte = seed[index % seed.length] ?? 0;
    vector.push(byte / 127.5 - 1);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function vectorLiteral(values: readonly number[]): string {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}

export function truncateToMaxChars(text: string, max: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, max).join('');
}

/** 存储层 sourceRefs → K5 Context 追溯形状。 */
export function toContextMemorySourceRefs(
  refs: readonly StoredMemorySourceRef[],
): ContextMemorySourceRef[] {
  const mapped: ContextMemorySourceRef[] = [];
  for (const ref of refs) {
    if (ref.refType === 'message' || ref.refType === 'session' || ref.refType === 'run') {
      mapped.push({ type: ref.refType, id: ref.refId });
    }
  }
  return mapped;
}
