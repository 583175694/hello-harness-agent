import { useCallback, useEffect, useState } from 'react';

import type { SkillCatalogItem } from '../fixtures/skill-fixtures';
import { skillCatalogFixtures } from '../fixtures/skill-fixtures';
import {
  filterCachedSkills,
  readSkillCatalogCache,
  writeSkillCatalogCache,
} from '../model/skill-catalog-cache';
import { useAgentHostSession } from './use-agent-host';

function initialSkillsForQuery(query: string, serviceReady: boolean): SkillCatalogItem[] {
  if (serviceReady) {
    const cached = filterCachedSkills(query);
    if (cached.length > 0) return cached;
    return [];
  }
  const q = query.trim().toLowerCase();
  if (!q) return skillCatalogFixtures;
  return skillCatalogFixtures.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}

/** 服务就绪后预拉全量 Skill，避免每次打开面板先闪 fixture 再切 API。 */
export function prefetchSkillCatalog(client: {
  listSkills: (query?: string) => Promise<{ skills: { name: string; description: string }[] }>;
}) {
  if (readSkillCatalogCache()) return Promise.resolve();
  return client
    .listSkills()
    .then((response) => {
      writeSkillCatalogCache(
        response.skills.map((skill) => ({
          name: skill.name,
          description: skill.description,
        })),
      );
    })
    .catch(() => undefined);
}

export function useSkillCatalog(query: string, enabled: boolean) {
  const { client, serviceState } = useAgentHostSession();
  const serviceReady = serviceState === 'ready';

  const [skills, setSkills] = useState<SkillCatalogItem[]>(() =>
    initialSkillsForQuery(query, serviceReady),
  );
  const [loading, setLoading] = useState(false);
  const [fromApi, setFromApi] = useState(() => Boolean(serviceReady && readSkillCatalogCache()));

  const refresh = useCallback(async () => {
    if (!serviceReady) {
      setFromApi(false);
      setSkills(initialSkillsForQuery(query, false));
      return;
    }

    const trimmed = query.trim();
    const cachedForQuery = filterCachedSkills(trimmed);
    if (cachedForQuery.length > 0) {
      setSkills(cachedForQuery);
      setFromApi(true);
    }

    const showLoading = cachedForQuery.length === 0;
    if (showLoading) setLoading(true);

    try {
      const response = await client.listSkills(trimmed || undefined);
      const next = response.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
      }));
      setSkills(next);
      setFromApi(true);
      if (!trimmed) {
        writeSkillCatalogCache(next);
      }
    } catch {
      setFromApi(false);
      if (cachedForQuery.length > 0) {
        setSkills(cachedForQuery);
        return;
      }
      setSkills(initialSkillsForQuery(query, false));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [client, query, serviceReady]);

  useEffect(() => {
    if (!enabled && !query.trim()) return;
    const handle = setTimeout(() => {
      void refresh();
    }, query.trim() ? 200 : 0);
    return () => clearTimeout(handle);
  }, [enabled, query, refresh]);

  useEffect(() => {
    if (!serviceReady) return;
    setSkills((prev) => {
      const next = filterCachedSkills(query);
      return next.length > 0 ? next : prev;
    });
  }, [query, serviceReady]);

  return { skills, loading, fromApi };
}

/** Chat 壳层挂载时预拉 Skill 列表，打开面板不再先闪 fixture。 */
export function useSkillCatalogWarmup() {
  const { client, serviceState } = useAgentHostSession();
  useEffect(() => {
    if (serviceState !== 'ready') return;
    void prefetchSkillCatalog(client);
  }, [client, serviceState]);
}
