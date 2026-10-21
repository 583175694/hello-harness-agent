import { z } from 'zod';

export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export const bundledSkillManifestSchema = z.object({
  name: z.string().regex(SKILL_NAME_PATTERN),
  description: z.string().min(1).max(500),
  version: z.string().min(1).max(32),
  source: z.literal('bundled/system'),
  modelCallable: z.literal(true),
});

export type BundledSkillManifest = z.infer<typeof bundledSkillManifestSchema>;

export type BundledSkillDefinition = BundledSkillManifest & {
  instructions: string;
};
