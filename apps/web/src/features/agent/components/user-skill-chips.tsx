import { SkillMentionInline } from './skill-mention-inline';

type UserSkillMentionsProps = {
  skillNames: string[];
};

/** Inline skill mentions for user message bubble (Codex-style, read-only). */
export function UserSkillMentions({ skillNames }: UserSkillMentionsProps) {
  if (!skillNames.length) return null;
  return (
    <>
      {skillNames.map((name) => (
        <SkillMentionInline key={name} name={name} mode="readonly" />
      ))}
    </>
  );
}
