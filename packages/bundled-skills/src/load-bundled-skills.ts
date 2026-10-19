import fs from 'node:fs';
import path from 'node:path';

import {
  bundledSkillManifestSchema,
  type BundledSkillDefinition,
} from './manifest';

const INSTRUCTIONS_FILE = 'instructions.md';
const MANIFEST_FILE = 'skill.json';

/** Directory that contains one folder per bundled skill (skill.json + instructions.md). */
export function resolveBundledSkillsDirectory(): string {
  return path.join(__dirname, '..', 'skills');
}

function readSkillFromDirectory(skillDir: string, folderName: string): BundledSkillDefinition {
  const manifestPath = path.join(skillDir, MANIFEST_FILE);
  const instructionsPath = path.join(skillDir, INSTRUCTIONS_FILE);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`BUNDLED_SKILL_MANIFEST_MISSING:${folderName}`);
  }
  if (!fs.existsSync(instructionsPath)) {
    throw new Error(`BUNDLED_SKILL_INSTRUCTIONS_MISSING:${folderName}`);
  }

  const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  const manifest = bundledSkillManifestSchema.parse(rawManifest);
  if (manifest.name !== folderName) {
    throw new Error(
      `BUNDLED_SKILL_NAME_FOLDER_MISMATCH:${folderName}:${manifest.name}`,
    );
  }

  const instructions = fs.readFileSync(instructionsPath, 'utf8').trim();
  if (!instructions) throw new Error(`BUNDLED_SKILL_INSTRUCTIONS_EMPTY:${folderName}`);

  return { ...manifest, instructions };
}

/** Load every bundled/system skill from the content package. */
export function loadBundledSkills(
  skillsRoot: string = resolveBundledSkillsDirectory(),
): BundledSkillDefinition[] {
  if (!fs.existsSync(skillsRoot)) {
    throw new Error(`BUNDLED_SKILLS_ROOT_MISSING:${skillsRoot}`);
  }

  const entries = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const skills = entries.map((folderName) =>
    readSkillFromDirectory(path.join(skillsRoot, folderName), folderName),
  );

  const seen = new Set<string>();
  for (const skill of skills) {
    if (seen.has(skill.name)) throw new Error(`BUNDLED_SKILL_DUPLICATE:${skill.name}`);
    seen.add(skill.name);
  }

  return skills;
}
