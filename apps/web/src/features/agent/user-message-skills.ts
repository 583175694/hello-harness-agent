/** Matches agent-protocol skill slug rules. */
const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export type UserMessageDisplay = {
  skillNames: string[];
  body: string;
};

function isSkillSlug(value: string): boolean {
  return SKILL_SLUG_PATTERN.test(value);
}

/** Strip leading `/slug` tokens that were persisted into message content for the model. */
export function parseSkillPrefixFromContent(content: string): UserMessageDisplay {
  const skillNames: string[] = [];
  let rest = content.trimStart();
  while (rest.startsWith('/')) {
    const spaceIndex = rest.indexOf(' ');
    const token = spaceIndex === -1 ? rest : rest.slice(0, spaceIndex);
    const slug = token.slice(1);
    if (!isSkillSlug(slug)) break;
    skillNames.push(slug);
    rest = spaceIndex === -1 ? '' : rest.slice(spaceIndex + 1).trimStart();
  }
  return { skillNames, body: rest };
}

export function stripSkillPrefixFromContent(content: string, skillNames: string[]): string {
  let rest = content.trimStart();
  for (const name of skillNames) {
    const prefix = `/${name}`;
    if (!rest.startsWith(prefix)) break;
    rest = rest.slice(prefix.length).trimStart();
  }
  return rest;
}

export function resolveUserMessageDisplay(input: {
  content: string;
  skillNames?: string[];
}): UserMessageDisplay {
  const metadataNames = input.skillNames?.filter(isSkillSlug) ?? [];
  if (metadataNames.length) {
    const body = stripSkillPrefixFromContent(input.content, metadataNames);
    return { skillNames: metadataNames, body };
  }
  return parseSkillPrefixFromContent(input.content);
}
