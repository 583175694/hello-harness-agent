import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadBundledSkills, resolveBundledSkillsDirectory } from '../src/load-bundled-skills';

describe('loadBundledSkills', () => {
  it('returns an empty list when no skill folders are present', () => {
    const skills = loadBundledSkills(resolveBundledSkillsDirectory());
    expect(skills).toEqual([]);
  });

  it('resolves skills directory next to compiled dist', () => {
    expect(resolveBundledSkillsDirectory()).toBe(path.join(process.cwd(), 'skills'));
  });
});
