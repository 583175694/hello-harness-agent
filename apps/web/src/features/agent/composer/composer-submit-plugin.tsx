import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  COMMAND_PRIORITY_LOW,
  INSERT_LINE_BREAK_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

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
        event?.preventDefault();
        onSubmitRequest();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [disabled, editor, onSubmitRequest]);

  return null;
}
