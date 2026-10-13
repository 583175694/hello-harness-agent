import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  createEditor,
  KEY_BACKSPACE_COMMAND,
} from 'lexical';
import { describe, expect, it } from 'vitest';

import { registerComposerSkillKeyCommands } from './composer-skill-key-commands';
import { $extractComposerDocument } from './skill-editor-utils';
import { $createSkillMentionNode, SkillMentionNode } from './skill-mention-node';

function setupChipAndText(textAfter: string) {
  const editor = createEditor({ nodes: [SkillMentionNode] });
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const paragraph = $createParagraphNode();
    paragraph.append($createSkillMentionNode('concise-chinese', 'concise-chinese'));
    paragraph.append($createTextNode(textAfter));
    root.append(paragraph);
  });
  registerComposerSkillKeyCommands(editor);
  editor.update(() => {
    const block = $getRoot().getFirstChild();
    if (!$isElementNode(block)) return;
    const textNode = block.getLastChild();
    if ($isTextNode(textNode)) {
      textNode.select(textAfter.length, textAfter.length);
    }
  });
  return editor;
}

function skillNames(editor: ReturnType<typeof createEditor>): string[] {
  let names: string[] = [];
  editor.read(() => {
    names = $extractComposerDocument().skillNames;
  });
  return names;
}

describe('ComposerSkillKeyPlugin backspace', () => {
  it('keeps skill chip when deleting the only letter after chip', () => {
    const editor = setupChipAndText('f');
    expect(skillNames(editor)).toEqual(['concise-chinese']);
    editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown', { key: 'Backspace' }));
    expect(skillNames(editor)).toEqual(['concise-chinese']);
  });

  it('removes skill chip when backspace at leading edge after chip', () => {
    const editor = setupChipAndText('\u200b');
    editor.update(() => {
      const block = $getRoot().getFirstChild();
      if (!$isElementNode(block)) return;
      const textNode = block.getLastChild();
      if ($isTextNode(textNode)) textNode.select(0, 0);
    });
    editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown', { key: 'Backspace' }));
    expect(skillNames(editor)).toEqual([]);
  });

  it('keeps skill chip when deleting f after auto-inserted space', () => {
    const editor = setupChipAndText(' f');
    editor.update(() => {
      const block = $getRoot().getFirstChild();
      if (!$isElementNode(block)) return;
      const textNode = block.getLastChild();
      if ($isTextNode(textNode)) textNode.select(2, 2);
    });
    editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown', { key: 'Backspace' }));
    expect(skillNames(editor)).toEqual(['concise-chinese']);
  });
});
