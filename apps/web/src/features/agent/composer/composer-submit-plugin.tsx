import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  COMMAND_PRIORITY_LOW,
  INSERT_LINE_BREAK_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

import { $extractComposerDocument } from './skill-editor-utils';

/** 输入框末尾正在输入 `/` Skill 查询时不应触发发送。 */
function $hasOpenSkillTypeaheadQuery(): boolean {
  const { plainText } = $extractComposerDocument();
  return /\/[^\s/]{0,40}$/.test(plainText);
}

export function ComposerSubmitPlugin({
  disabled,
  onSubmitRequest,
}: {
  disabled: boolean;
  onSubmitRequest: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (disabled) return false;
        if (event?.shiftKey) {
          event.preventDefault();
          editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
          return true;
        }
        if (event && (event.isComposing || event.keyCode === 229)) {
          return false;
        }
        let blockedBySkillQuery = false;
        editor.getEditorState().read(() => {
          blockedBySkillQuery = $hasOpenSkillTypeaheadQuery();
        });
        if (blockedBySkillQuery) return false;
        event?.preventDefault();
        onSubmitRequest();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [disabled, editor, onSubmitRequest]);

  return null;
}
