import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadBundledSkills, resolveBundledSkillsDirectory } from '../src/load-bundled-skills';

describe('loadBundledSkills', () => {
  const skills = loadBundledSkills(resolveBundledSkillsDirectory());

  it('resolves skills directory next to compiled dist', () => {
    expect(resolveBundledSkillsDirectory()).toBe(path.join(process.cwd(), 'skills'));
  });

  it('loads the ai-ppt-html presentation skill', () => {
    const skill = skills.find((entry) => entry.name === 'ai-ppt-html');
    expect(skill).toMatchObject({
      source: 'bundled/system',
      modelCallable: true,
    });
    expect(skill?.instructions).toContain('1280px');
    expect(skill?.instructions).toContain('Noto Sans CJK SC');
    expect(skill?.instructions).toContain('htmlFileId');
  });

  it('has a non-empty description and unique names', () => {
    for (const skill of skills) {
      expect(skill.description.trim().length).toBeGreaterThan(0);
      expect(skill.description.length).toBeLessThanOrEqual(500);
    }
    expect(new Set(skills.map((skill) => skill.name)).size).toBe(skills.length);
  });
});
