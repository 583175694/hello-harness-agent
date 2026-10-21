import { Box } from 'lucide-react';

export type SkillMentionInlineProps = {
  name: string;
  label?: string;
  mode?: 'readonly' | 'editable';
};

export function SkillMentionInline({ name, label, mode = 'readonly' }: SkillMentionInlineProps) {
  const text = label ?? name;
  return (
    <span
      className={`skill-mention${mode === 'editable' ? ' skill-mention--editable' : ''}`}
      contentEditable={mode === 'editable' ? false : undefined}
      data-skill-name={name}
    >
      <span className="skill-mention__pill">
        <Box className="skill-mention__icon" size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className="skill-mention__label">{text}</span>
      </span>
    </span>
  );
}
