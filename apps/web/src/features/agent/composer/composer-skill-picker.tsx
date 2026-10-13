import { Box, LoaderCircle } from 'lucide-react';
import type { RefObject } from 'react';

export type SkillCatalogItem = {
  name: string;
  description: string;
};

export type SkillCatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export function skillCatalogEmptyMessage(
  status: SkillCatalogStatus,
  query?: string,
): { title: string; detail?: string } {
  if (status === 'loading') {
    return { title: '正在加载 Skill…' };
  }
  if (status === 'error') {
    return {
      title: '无法加载 Skill 目录',
      detail: '请确认已登录，或稍后再试。',
    };
  }
  const trimmed = query?.trim() ?? '';
  if (trimmed) {
    return { title: '没有匹配的 Skill', detail: `试试其他关键词，或输入 / 浏览全部。` };
  }
  return {
    title: '暂无可用的 Skill',
    detail: '在输入框输入 / 可快速插入；项目与市场 Skill 上线后会出现在这里。',
  };
}

export function ComposerSkillPickerEmpty({
  status,
  query,
}: {
  status: SkillCatalogStatus;
  query?: string;
}) {
  const copy = skillCatalogEmptyMessage(status, query);
  return (
    <div className="composer-quick-panel__empty composer-skill-picker-empty" role="status">
      {status === 'loading' ? (
        <LoaderCircle className="spin composer-skill-picker-empty__icon" size={18} aria-hidden="true" />
      ) : null}
      <p className="composer-skill-picker-empty__title">{copy.title}</p>
      {copy.detail ? <p className="composer-skill-picker-empty__detail">{copy.detail}</p> : null}
    </div>
  );
}

export function ComposerSkillPickerRow({
  skill,
  active,
  disabled,
  onMouseEnter,
  onMouseDown,
  onClick,
  optionRef,
}: {
  skill: SkillCatalogItem;
  active?: boolean;
  disabled?: boolean;
  onMouseEnter?: () => void;
  onMouseDown?: (event: React.MouseEvent) => void;
  onClick?: () => void;
  optionRef?: (element: HTMLElement | null) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active ?? false}
      disabled={disabled}
      className={`composer-quick-panel__row composer-skill-picker-row${active ? ' is-active' : ''}`}
      ref={optionRef}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <span className="composer-quick-panel__skill-mark" aria-hidden="true">
        <Box size={16} strokeWidth={1.75} />
      </span>
      <span className="composer-quick-panel__skill-copy composer-skill-picker-row__copy">
        <strong>{skill.name}</strong>
        {skill.description ? <small>{skill.description}</small> : null}
      </span>
    </button>
  );
}

export function ComposerSkillPickerShell({
  title = '技能',
  listRef,
  children,
  footer,
  className = '',
}: {
  title?: string;
  listRef?: RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`composer-quick-panel composer-typeahead-panel composer-skill-picker${className ? ` ${className}` : ''}`}
      role="listbox"
      aria-label={title}
    >
      <div className="composer-quick-panel__title">{title}</div>
      <div className="composer-quick-panel__list" ref={listRef}>
        {children}
      </div>
      {footer}
    </div>
  );
}
