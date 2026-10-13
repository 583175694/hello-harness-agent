import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadBundledSkills, resolveBundledSkillsDirectory } from '../src/load-bundled-skills';

describe('loadBundledSkills', () => {
  it('loads bundled skills from the package skills directory', () => {
    const skills = loadBundledSkills(resolveBundledSkillsDirectory());
    expect(skills.map((skill) => skill.name).sort()).toEqual([
      'concise-chinese',
      'research-summary',
    ]);
    const research = skills.find((skill) => skill.name === 'research-summary');
    expect(research).toMatchObject({
      source: 'bundled/system',
      modelCallable: true,
      version: '1.0.0',
    });
    expect(research?.instructions).toContain('authoritative evidence');
    expect(research).not.toHaveProperty('instructions', '');
  });

  it('resolves skills directory next to compiled dist', () => {
    expect(resolveBundledSkillsDirectory()).toBe(path.join(process.cwd(), 'skills'));
  });
});
