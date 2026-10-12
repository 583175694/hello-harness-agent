import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  createEditor,
  type LexicalNode,
} from 'lexical';
import { describe, expect, it } from 'vitest';

import {
  dedupeSkillNames,
  $insertSkillMentionFromTypeahead,
} from './skill-editor-utils';
import {
  $createSkillMentionNode,
  $isSkillMentionNode,
  SkillMentionNode,
} from './skill-mention-node';

describe('dedupeSkillNames', () => {
  it('keeps first occurrence order', () => {
    expect(dedupeSkillNames(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });
});

describe('$insertSkillMentionFromTypeahead', () => {
  it('replaces trigger query without relying on selection anchor', () => {
    const editor = createEditor({ nodes: [SkillMentionNode] });
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('总结一下这篇文章/research'));
      root.append(paragraph);
    });
    editor.update(() => {
      const block = $getRoot().getFirstChild();
      if (!$isParagraphNode(block)) throw new Error('expected paragraph node');
      const textNode = block.getFirstChild();
      if (!$isTextNode(textNode)) throw new Error('expected text node');
      $insertSkillMentionFromTypeahead(
        $createSkillMentionNode('research-summary', 'research-summary'),
        textNode,
        'research',
        '/',
      );
    });
    editor.read(() => {
      const block = $getRoot().getFirstChild();
      if (!$isParagraphNode(block)) throw new Error('expected paragraph node');
      const children = block.getChildren();
      expect(children.some((node: LexicalNode) => $isSkillMentionNode(node))).toBe(true);
      expect(block.getTextContent()).toContain('总结一下这篇文章');
      expect(block.getTextContent()).not.toContain('/research');
    });
  });
});
