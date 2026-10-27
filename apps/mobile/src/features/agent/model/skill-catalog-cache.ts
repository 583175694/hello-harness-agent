import type { SkillCatalogItem } from '../fixtures/skill-fixtures';

const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedAllSkills: SkillCatalogItem[] | null = null;
let cachedAt = 0;

export function readSkillCatalogCache(): SkillCatalogItem[] | null {
  if (!cachedAllSkills?.length) return null;
  if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
  return cachedAllSkills;
}

export function writeSkillCatalogCache(skills: SkillCatalogItem[]): void {
  cachedAllSkills = skills;
  cachedAt = Date.now();
}

export function filterCachedSkills(query: string): SkillCatalogItem[] {
  const base = readSkillCatalogCache();
  if (!base) return [];
  const q = query.trim().toLowerCase();
  if (!q) return base;
  return base.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}
