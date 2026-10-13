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
    return { title: '正在加载技能…' };
  }
  if (status === 'error') {
    return {
      title: '无法加载技能目录',
      detail: '请确认已登录，或稍后再试。',
    };
  }
  const trimmed = query?.trim() ?? '';
  if (trimmed) {
    return { title: '没有匹配的技能', detail: '试试其他关键词' };
  }
  return { title: '暂无技能' };
}

export function ComposerSkillPickerEmpty({
  status,
  query,
}: {
  status: SkillCatalogStatus;
  query?: string;
}) {
  const copy = skillCatalogEmptyMessage(status, query);
  const tone =
    status === 'loading' ? 'loading' : status === 'error' ? 'error' : query?.trim() ? 'nomatch' : 'empty';

  if (status === 'loading') {
    return (
      <div className={`composer-skill-picker-empty composer-skill-picker-empty--${tone}`} role="status">
        <div className="composer-skill-picker-empty__loading">
          <LoaderCircle className="spin composer-skill-picker-empty__spinner" size={16} aria-hidden="true" />
          <span>{copy.title}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`composer-skill-picker-empty composer-skill-picker-empty--${tone}`} role="status">
      <div className="composer-skill-picker-empty__ghost">
        <span className="composer-quick-panel__skill-mark">
          <Box size={16} strokeWidth={1.75} />
        </span>
        <span className="composer-skill-picker-empty__copy">
          <strong>{copy.title}</strong>
          {copy.detail ? <small>{copy.detail}</small> : null}
        </span>
      </div>
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
