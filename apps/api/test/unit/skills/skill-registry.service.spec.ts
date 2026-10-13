import { describe, expect, it } from 'vitest';
import { SkillRegistryService, type SkillDefinition } from '../../../src/skills/skill-registry.service';

const demoSkill: SkillDefinition = {
  name: 'demo-skill',
  description: 'Demo skill for unit tests',
  version: '1.0.0',
  source: 'bundled/system',
  modelCallable: true,
  instructions: 'Follow the demo instructions.',
};

describe('SkillRegistryService', () => {
  it('starts empty and lists metadata without instructions after register', () => {
    const registry = new SkillRegistryService();
    expect(registry.list()).toEqual([]);
    registry.register(demoSkill);
    const [entry] = registry.list('demo');
    expect(entry).toMatchObject({ name: 'demo-skill', source: 'bundled/system' });
    expect(entry).not.toHaveProperty('instructions');
    const skill = registry.read(entry!.name, entry!.version);
    expect(registry.render(skill)).toContain('<skill_content name="demo-skill"');
  });

  it('rejects unknown and mismatched versions', () => {
    const registry = new SkillRegistryService();
    registry.register(demoSkill);
    expect(() => registry.read('missing')).toThrow('SKILL_NOT_FOUND');
    expect(() => registry.read('demo-skill', '9.0.0')).toThrow('SKILL_VERSION_MISMATCH');
  });

  it('matches multi-word queries across name and description', () => {
    const registry = new SkillRegistryService();
    registry.register(demoSkill);
    expect(registry.list('demo unit').map((entry) => entry.name)).toEqual(['demo-skill']);
  });
});
