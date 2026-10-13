import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

import { registerComposerSkillKeyCommands } from './composer-skill-key-commands';

/** Skill chip 键盘：误聚焦 chip 时 Backspace 不删 chip；删除 chip 请用 chip 上的 ×。 */
export function ComposerSkillKeyPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => registerComposerSkillKeyCommands(editor), [editor]);

  return null;
}
