import type { ClientContext } from './types.js';

export function createSkillsApi(ctx: ClientContext) {
  async function listSkills(
    query?: string,
  ): Promise<{ skills: Array<{ name: string; description: string; version: string; source: string }> }> {
    const suffix = query ? `?query=${encodeURIComponent(query)}` : '';
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/skills${suffix}`);
    return (await ctx.parseResponse(response)) as {
      skills: Array<{ name: string; description: string; version: string; source: string }>;
    };
  }

  return { listSkills };
}
