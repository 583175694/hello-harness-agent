import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef } from 'react';

import {
  $clearComposerEditor,
  $extractComposerDocument,
  $setComposerPlainText,
  $stripComposerPlainTextPreservingSkills,
} from './skill-editor-utils';

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
      const { skillNames } = $extractComposerDocument();
      if (seedPlainText.trim()) {
        $setComposerPlainText(seedPlainText);
        return;
      }
      // 仅清空纯文本时保留已有 Skill chip，避免 reset 误伤。
      if (skillNames.length > 0) {
        $stripComposerPlainTextPreservingSkills();
        return;
      }
      $clearComposerEditor();
    });
  }, [editor, resetKey, seedPlainText]);

  return null;
}
