import { useCallback, useEffect, useState } from 'react';

import type { SkillCatalogItem } from '../fixtures/skill-fixtures';
import { skillCatalogFixtures } from '../fixtures/skill-fixtures';
import { useAgentHost } from './use-agent-host';

export function useSkillCatalog(query: string, enabled: boolean) {
  const { client, serviceState } = useAgentHost();
  const [skills, setSkills] = useState<SkillCatalogItem[]>(skillCatalogFixtures);
  const [loading, setLoading] = useState(false);
  const [fromApi, setFromApi] = useState(false);

  const refresh = useCallback(async () => {
    if (serviceState !== 'ready' || !enabled) {
      setFromApi(false);
      setSkills(skillCatalogFixtures);
      return;
    }
    setLoading(true);
    try {
      const trimmed = query.trim();
      const response = await client.listSkills(trimmed || undefined);
      setSkills(
        response.skills.map((skill) => ({
          name: skill.name,
          description: skill.description,
        })),
      );
      setFromApi(true);
    } catch {
      setFromApi(false);
      const q = query.trim().toLowerCase();
      setSkills(
        q
          ? skillCatalogFixtures.filter(
              (s) =>
                s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
            )
          : skillCatalogFixtures,
      );
    } finally {
      setLoading(false);
    }
  }, [client, enabled, query, serviceState]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void refresh();
    }, query.trim() ? 200 : 0);
    return () => clearTimeout(handle);
  }, [refresh, query]);

  return { skills, loading, fromApi };
}
