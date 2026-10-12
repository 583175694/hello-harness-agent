import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

import { $isSkillMentionNode } from './skill-mention-node';

/** 光标紧贴 Skill chip 时一次 Backspace 即可删除，避免 isolated 节点需按两次。 */
export function ComposerSkillKeyPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        let handled = false;
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

          const anchorNode = selection.anchor.getNode();
          if ($isSkillMentionNode(anchorNode)) {
            anchorNode.remove();
            handled = true;
            return;
          }

          if (!$isTextNode(anchorNode)) return;
          const offset = selection.anchor.offset;
          if (offset === 0) {
            const previous = anchorNode.getPreviousSibling();
            if ($isSkillMentionNode(previous)) {
              previous.remove();
              handled = true;
            }
            return;
          }

          if (offset === 1 && anchorNode.getTextContent() === ' ') {
            const previous = anchorNode.getPreviousSibling();
            if ($isSkillMentionNode(previous)) {
              previous.remove();
              anchorNode.remove();
              handled = true;
            }
          }
        });
        if (handled) {
          event?.preventDefault();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}
