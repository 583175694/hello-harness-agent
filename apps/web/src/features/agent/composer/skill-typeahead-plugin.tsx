import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { COMMAND_PRIORITY_HIGH, type TextNode } from 'lexical';
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { listSkills } from '../../../api/client';
import {
  ComposerSkillPickerEmpty,
  ComposerSkillPickerRow,
  ComposerSkillPickerShell,
  type SkillCatalogStatus,
} from './composer-skill-picker';
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

export function SkillTypeaheadPlugin({ enabled }: { enabled: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<SkillMenuOption[]>([]);
  const [status, setStatus] = useState<SkillCatalogStatus>('idle');
  const triggerMatch = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0,
    maxLength: 40,
  });

  useEffect(() => {
    if (!enabled || query === null) {
      setOptions([]);
      setStatus('idle');
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    const handle = window.setTimeout(() => {
      void listSkills(query || undefined)
        .then((response) => {
          if (cancelled) return;
          setStatus('ready');
          setOptions(
            (response.skills ?? []).map(
              (skill) => new SkillMenuOption(skill.name, skill.description),
            ),
          );
        })
        .catch(() => {
          if (!cancelled) {
            setStatus('error');
            setOptions([]);
          }
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
      textNodeContainingQuery: TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      editor.update(() => {
        const mentionNode = $createSkillMentionNode(selectedOption.name, selectedOption.label);
        $insertSkillMentionFromTypeahead(
          mentionNode,
          textNodeContainingQuery,
          matchingString,
          '/',
        );
      });
      closeMenu();
    },
    [editor],
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
      if (!anchorElementRef.current) return null;
      const { selectedIndex, selectOptionAndCleanUp, options: menuOptions } = itemProps;
      const showEmpty = menuOptions.length === 0;
      return createPortal(
        <ComposerSkillPickerShell title="技能">
          {showEmpty ? (
            <ComposerSkillPickerEmpty status={status} query={query ?? undefined} />
          ) : (
            menuOptions.map((option, index) => (
              <ComposerSkillPickerRow
                key={option.key}
                skill={{ name: option.label, description: option.description }}
                active={selectedIndex === index}
                optionRef={(element) => option.setRefElement(element)}
                onMouseEnter={() => itemProps.setHighlightedIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOptionAndCleanUp(option)}
              />
            ))
          )}
        </ComposerSkillPickerShell>,
        anchorElementRef.current,
      );
    },
    [query, status],
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
