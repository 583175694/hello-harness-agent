import { Injectable } from '@nestjs/common';

export type SkillSource = 'bundled/system' | 'project' | 'user' | 'session/runtime';
export type SkillDefinition = {
  name: string;
  description: string;
  version: string;
  source: SkillSource;
  modelCallable: boolean;
  instructions: string;
};

export type SkillCatalogEntry = Omit<SkillDefinition, 'instructions'>;

@Injectable()
export class SkillRegistryService {
  private readonly skills = new Map<string, SkillDefinition>();

  constructor() {
    this.register({
      name: 'research-summary',
      description: 'Research a topic, distinguish evidence from inference, and produce a concise sourced summary.',
      version: '1.0.0',
      source: 'bundled/system',
      modelCallable: true,
      instructions: 'For research tasks, identify the question, gather authoritative evidence, state uncertainty, and provide a concise summary with source references.',
    });
    this.register({
      name: 'concise-chinese',
      description: 'Answer in concise, clear Simplified Chinese with direct structure and minimal repetition.',
      version: '1.0.0',
      source: 'bundled/system',
      modelCallable: true,
      instructions: 'Use concise Simplified Chinese. Lead with the answer, use short paragraphs, and avoid repeating the user request.',
    });
  }

  register(skill: SkillDefinition): void {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(skill.name)) throw new Error('INVALID_SKILL_NAME');
    this.skills.set(skill.name, { ...skill });
  }

  list(query?: string, limit = 50): SkillCatalogEntry[] {
    const terms = query?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    return [...this.skills.values()]
      .filter((skill) => skill.modelCallable)
      .filter((skill) => {
        if (!terms.length) return true;
        const haystack = `${skill.name} ${skill.description}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((skill) => ({ name: skill.name, description: skill.description, version: skill.version, source: skill.source, modelCallable: skill.modelCallable }));
  }

  read(name: string, version?: string): SkillDefinition {
    const skill = this.skills.get(name);
    if (!skill || !skill.modelCallable) throw new Error('SKILL_NOT_FOUND');
    if (version && version !== skill.version) throw new Error('SKILL_VERSION_MISMATCH');
    return { ...skill };
  }

  render(skill: SkillDefinition): string {
    return `<skill_content name="${escapeXml(skill.name)}" version="${escapeXml(skill.version)}"><skill_resources></skill_resources><skill_instructions>${escapeXml(skill.instructions)}</skill_instructions></skill_content>`;
  }
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}
