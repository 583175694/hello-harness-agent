import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from 'lexical';

import { $isSkillMentionNode, type SkillMentionNode } from './skill-mention-node';

const ZWSP = '\u200b';

function meaningfulTextLength(text: string): number {
  return text.replace(/\u200b/g, '').length;
}

function $removeSkillMentionAndEmptyTrailing(mention: SkillMentionNode): void {
  const trailing = mention.getNextSibling();
  mention.remove();
  if ($isTextNode(trailing) && meaningfulTextLength(trailing.getTextContent()) === 0) {
    trailing.remove();
  }
}

function $trailingHasUserText(node: LexicalNode | null | undefined): boolean {
  return $isTextNode(node) && meaningfulTextLength(node.getTextContent()) > 0;
}

function $deleteSkillIfTrailingEmpty(mention: SkillMentionNode): boolean {
  const trailing = mention.getNextSibling();
  if ($trailingHasUserText(trailing)) return false;
  $removeSkillMentionAndEmptyTrailing(mention);
  return true;
}

function $deletePreviousSkillWhenAtLeadingEdge(textNode: TextNode, offset: number): boolean {
  if (offset !== 0) return false;
  const previous = textNode.getPreviousSibling();
  if (!$isSkillMentionNode(previous)) return false;
  if (meaningfulTextLength(textNode.getTextContent()) > 0) {
    previous.remove();
    return true;
  }
  $removeSkillMentionAndEmptyTrailing(previous);
  if (meaningfulTextLength(textNode.getTextContent()) === 0) {
    textNode.remove();
  }
  return true;
}

function $deleteSkillFromParagraphCaret(paragraphOffset: number, paragraphChildren: LexicalNode[]): boolean {
  if (paragraphOffset <= 0) return false;
  const nodeBefore = paragraphChildren[paragraphOffset - 1];
  if (!$isSkillMentionNode(nodeBefore)) return false;
  const nodeAt = paragraphChildren[paragraphOffset];
  if ($trailingHasUserText(nodeAt)) return false;
  $removeSkillMentionAndEmptyTrailing(nodeBefore);
  return true;
}

function $deleteOneCharacterBeforeCaret(textNode: TextNode, offset: number): boolean {
  if (offset <= 0) return false;
  const text = textNode.getTextContent();
  const nextText = text.slice(0, offset - 1) + text.slice(offset);
  textNode.setTextContent(nextText);
  const nextOffset = offset - 1;
  textNode.select(nextOffset, nextOffset);
  return true;
}

/** 在 editor.update 内调用。 */
export function $performSkillComposerBackspace(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const anchorNode = selection.anchor.getNode();
  const offset = selection.anchor.offset;

  if ($isSkillMentionNode(anchorNode)) {
    if ($deleteSkillIfTrailingEmpty(anchorNode)) return true;
    const trailing = anchorNode.getNextSibling();
    if ($isTextNode(trailing)) {
      trailing.select(trailing.getTextContentSize(), trailing.getTextContentSize());
      return true;
    }
    return false;
  }

  if ($isTextNode(anchorNode)) {
    if ($deletePreviousSkillWhenAtLeadingEdge(anchorNode, offset)) return true;
    if (
      offset > 0 &&
      meaningfulTextLength(anchorNode.getTextContent()) === 0 &&
      anchorNode.getTextContent().includes(ZWSP) &&
      $isSkillMentionNode(anchorNode.getPreviousSibling())
    ) {
      $removeSkillMentionAndEmptyTrailing(anchorNode.getPreviousSibling() as SkillMentionNode);
      anchorNode.remove();
      return true;
    }
    if ($deleteOneCharacterBeforeCaret(anchorNode, offset)) return true;
    return false;
  }

  if ($isParagraphNode(anchorNode)) {
    const children = anchorNode.getChildren();
    return $deleteSkillFromParagraphCaret(offset, children);
  }

  const parent = anchorNode.getParent();
  if ($isParagraphNode(parent)) {
    const index = anchorNode.getIndexWithinParent();
    const children = parent.getChildren();
    const caretIndex =
      $isTextNode(anchorNode) && offset >= anchorNode.getTextContentSize() ? index + 1 : index;
    return $deleteSkillFromParagraphCaret(caretIndex, children);
  }

  return false;
}

export function runSkillComposerBackspace(editor: LexicalEditor): boolean {
  let handled = false;
  editor.update(() => {
    handled = $performSkillComposerBackspace();
  });
  return handled;
}

export function registerComposerSkillKeyCommands(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    KEY_BACKSPACE_COMMAND,
    (event) => {
      const handled = runSkillComposerBackspace(editor);
      if (handled) {
        event?.preventDefault();
        return true;
      }
      return false;
    },
    COMMAND_PRIORITY_HIGH,
  );
}
