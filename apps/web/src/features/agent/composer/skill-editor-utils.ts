import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $getSelection,
  type LexicalEditor,
  type TextNode,
} from 'lexical';

import { $createSkillMentionNode, $isSkillMentionNode, SkillMentionNode } from './skill-mention-node';

export type ComposerDocumentValue = {
  plainText: string;
  skillNames: string[];
};

export function dedupeSkillNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

export function $extractComposerDocument(): ComposerDocumentValue {
  const root = $getRoot();
  const skillNames: string[] = [];
  const lines: string[] = [];

  for (const block of root.getChildren()) {
    if ($isParagraphNode(block)) {
      const lineParts: string[] = [];
      for (const child of block.getChildren()) {
        if ($isSkillMentionNode(child)) {
          skillNames.push(child.getSkillName());
        } else if ($isTextNode(child)) {
          lineParts.push(child.getTextContent());
        } else if ($isLineBreakNode(child)) {
          lineParts.push('\n');
        }
      }
      lines.push(lineParts.join(''));
    } else if ($isElementNode(block)) {
      lines.push(block.getTextContent());
    }
  }

  return {
    plainText: lines.join('\n'),
    skillNames: dedupeSkillNames(skillNames),
  };
}

export function $insertSkillMentionFromTypeahead(
  mentionNode: SkillMentionNode,
  textNodeContainingQuery: TextNode | null,
  matchingString: string,
  trigger: string,
): void {
  if (!textNodeContainingQuery) {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selection.insertNodes([mentionNode]);
    }
    return;
  }

  const replaceToken = trigger + matchingString;
  const text = textNodeContainingQuery.getTextContent();
  let beforeText = text;
  let afterText = '';

  const selection = $getSelection();
  if ($isRangeSelection(selection) && selection.anchor.getNode().getKey() === textNodeContainingQuery.getKey()) {
    const anchorOffset = selection.anchor.offset;
    const startOffset = anchorOffset - replaceToken.length;
    if (startOffset >= 0) {
      beforeText = text.slice(0, startOffset);
      afterText = text.slice(anchorOffset);
    }
  } else if (text.endsWith(replaceToken)) {
    beforeText = text.slice(0, text.length - replaceToken.length);
  } else {
    const triggerIndex = text.lastIndexOf(trigger);
    if (triggerIndex < 0) return;
    beforeText = text.slice(0, triggerIndex);
    afterText = text.slice(triggerIndex + replaceToken.length);
  }

  textNodeContainingQuery.setTextContent(beforeText);
  textNodeContainingQuery.insertAfter(mentionNode);

  if (afterText) {
    const afterNode = $createTextNode(afterText);
    mentionNode.insertAfter(afterNode);
    afterNode.select(0, 0);
    return;
  }

  const spacer = $createTextNode(' ');
  mentionNode.insertAfter(spacer);
  spacer.select(1, 1);
}

export function $insertSkillMentionAtSelection(name: string, label: string): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  const mentionNode = $createSkillMentionNode(name, label);
  selection.insertNodes([mentionNode]);
  const spacer = $createTextNode(' ');
  mentionNode.insertAfter(spacer);
  spacer.select(1, 1);
}

export function $clearComposerEditor(): void {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  root.append(paragraph);
  paragraph.selectEnd();
}

export function $setComposerPlainText(text: string): void {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  if (text) {
    paragraph.append($createTextNode(text));
  }
  root.append(paragraph);
  paragraph.selectEnd();
}

export function readComposerDocument(editor: LexicalEditor): ComposerDocumentValue {
  let value: ComposerDocumentValue = { plainText: '', skillNames: [] };
  editor.getEditorState().read(() => {
    value = $extractComposerDocument();
  });
  return value;
}
