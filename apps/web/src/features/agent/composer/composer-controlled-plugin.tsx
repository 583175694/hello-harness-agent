import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef } from 'react';

import { $clearComposerEditor, $setComposerPlainText } from './skill-editor-utils';

export function ComposerControlledPlugin({
  resetKey,
  seedPlainText,
}: {
  resetKey: number;
  seedPlainText: string;
}) {
  const [editor] = useLexicalComposerContext();
  const lastResetKeyRef = useRef(-1);

  useEffect(() => {
    if (resetKey === lastResetKeyRef.current) return;
    lastResetKeyRef.current = resetKey;
    editor.update(() => {
      if (seedPlainText.trim()) {
        $setComposerPlainText(seedPlainText);
      } else {
        $clearComposerEditor();
      }
    });
  }, [editor, resetKey, seedPlainText]);

  return null;
}
