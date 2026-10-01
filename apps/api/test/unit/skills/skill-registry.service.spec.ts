import { describe, expect, it } from 'vitest';
import { SkillRegistryService } from '../../../src/skills/skill-registry.service';

describe('SkillRegistryService', () => {
  it('lists metadata without instructions and reads the same skill body', () => {
    const registry = new SkillRegistryService();
    const [entry] = registry.list('research');
    expect(entry).toMatchObject({ name: 'research-summary', source: 'bundled/system' });
    expect(entry).not.toHaveProperty('instructions');
    const skill = registry.read(entry!.name, entry!.version);
    expect(registry.render(skill)).toContain('<skill_content name="research-summary"');
  });

  it('rejects unknown and mismatched versions', () => {
    const registry = new SkillRegistryService();
    expect(() => registry.read('missing')).toThrow('SKILL_NOT_FOUND');
    expect(() => registry.read('research-summary', '9.0.0')).toThrow('SKILL_VERSION_MISMATCH');
  });

  it('matches multi-word queries across name and description', () => {
    const registry = new SkillRegistryService();
    expect(registry.list('concise chinese').map((entry) => entry.name)).toEqual(['concise-chinese']);
  });
});
