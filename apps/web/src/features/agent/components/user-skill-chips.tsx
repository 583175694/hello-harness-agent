import { BookOpen } from 'lucide-react';

type UserSkillChipsProps = {
  skillNames: string[];
  className?: string;
};

export function UserSkillChips({ skillNames, className }: UserSkillChipsProps) {
  if (!skillNames.length) return null;
  return (
    <div className={className ?? 'user-message-skills'} role="list" aria-label="已使用的 Skill">
      {skillNames.map((name) => (
        <span
          key={name}
          className="composer-skill-chip composer-skill-chip--readonly"
          role="listitem"
          data-skill-name={name}
        >
          <BookOpen size={14} aria-hidden="true" />
          <span>{name}</span>
        </span>
      ))}
    </div>
  );
}
