import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { COMMAND_PRIORITY_HIGH } from 'lexical';
import { BookOpen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { listSkills } from '../../../api/client';
import { $createSkillMentionNode } from './skill-mention-node';
import { $insertSkillMentionFromTypeahead } from './skill-editor-utils';

class SkillMenuOption extends MenuOption {
  name: string;
  label: string;
  description: string;

  constructor(name: string, description: string) {
    super(name);
    this.name = name;
    this.label = name;
    this.description = description;
  }
}

function SkillTypeaheadMenu({
  trigger,
  enabled,
}: {
  trigger: '@' | '/';
  enabled: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<SkillMenuOption[]>([]);
  const triggerMatch = useBasicTypeaheadTriggerMatch(trigger, {
    minLength: 0,
    maxLength: 40,
  });

  useEffect(() => {
    if (!enabled || query === null) {
      setOptions([]);
      return undefined;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void listSkills(query || undefined)
        .then((response) => {
          if (cancelled) return;
          setOptions(
            (response.skills ?? []).map(
              (skill) => new SkillMenuOption(skill.name, skill.description),
            ),
          );
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [enabled, query]);

  const onSelectOption = useCallback(
    (
      selectedOption: SkillMenuOption,
      textNodeContainingQuery: import('lexical').TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      editor.update(() => {
        const mentionNode = $createSkillMentionNode(selectedOption.name, selectedOption.label);
        $insertSkillMentionFromTypeahead(
          mentionNode,
          textNodeContainingQuery,
          matchingString,
          trigger,
        );
      });
      closeMenu();
    },
    [editor, trigger],
  );

  const menuRenderFn = useCallback(
    (
      anchorElementRef: RefObject<HTMLElement | null>,
      itemProps: {
        selectedIndex: number | null;
        selectOptionAndCleanUp: (option: SkillMenuOption) => void;
        setHighlightedIndex: (index: number) => void;
        options: SkillMenuOption[];
      },
    ) => {
      const { selectedIndex, selectOptionAndCleanUp, options: menuOptions } = itemProps;
      if (!anchorElementRef.current || !menuOptions.length) return null;
      return createPortal(
        <div className="composer-quick-panel composer-typeahead-panel" role="listbox" aria-label="Skill">
          <div className="composer-quick-panel__title">Skill</div>
          <div className="composer-quick-panel__list">
            {menuOptions.map((option, index) => (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={selectedIndex === index}
                className={`composer-quick-panel__row${selectedIndex === index ? ' is-active' : ''}`}
                ref={(element) => option.setRefElement(element)}
                onMouseEnter={() => itemProps.setHighlightedIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOptionAndCleanUp(option)}
              >
                <span className="composer-quick-panel__skill-mark">
                  <BookOpen size={16} aria-hidden="true" />
                </span>
                <span className="composer-quick-panel__skill-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            ))}
          </div>
        </div>,
        anchorElementRef.current,
      );
    },
    [],
  );

  if (!enabled) return null;

  return (
    <LexicalTypeaheadMenuPlugin
      triggerFn={triggerMatch}
      options={options}
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      menuRenderFn={menuRenderFn}
      commandPriority={COMMAND_PRIORITY_HIGH}
    />
  );
}

export function SkillTypeaheadPlugin({ enabled }: { enabled: boolean }) {
  const triggers = useMemo(() => ['@', '/'] as const, []);
  return (
    <>
      {triggers.map((trigger) => (
        <SkillTypeaheadMenu key={trigger} trigger={trigger} enabled={enabled} />
      ))}
    </>
  );
}
