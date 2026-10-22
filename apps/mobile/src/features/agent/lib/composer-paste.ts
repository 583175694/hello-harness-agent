import type { ComposerAttachmentFixture } from '../fixtures/ui-fixtures';

/** 为当前草稿中的自动粘贴文本选择可读且不冲突的文件名（与 Web Composer 一致）。 */
export function nextPastedTextFileName(attachments: Pick<ComposerAttachmentFixture, 'fileName'>[]): string {
  const usedNames = new Set(
    attachments
      .map((attachment) => attachment.fileName)
      .filter((fileName) => /^pasted-text(?:-\d+)?\.txt$/u.test(fileName)),
  );
  if (!usedNames.has('pasted-text.txt')) return 'pasted-text.txt';
  for (let index = 2; ; index += 1) {
    const fileName = `pasted-text-${index}.txt`;
    if (!usedNames.has(fileName)) return fileName;
  }
}

/** 推断单次 onChangeText 中相对 before 插入的子串（含选区替换）。 */
export function findInsertedSubstring(before: string, after: string): string | null {
  if (after === before) return null;
  if (after.startsWith(before)) return after.slice(before.length);
  if (after.endsWith(before)) return after.slice(0, after.length - before.length);

  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const inserted = after.slice(prefix, after.length - suffix);
  return inserted.length ? inserted : null;
}

export function draftAfterExtractingInsert(before: string, after: string, inserted: string): string {
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1;
  }
  return after.slice(0, prefix) + after.slice(prefix + inserted.length);
}

export function countCodePoints(text: string): number {
  return [...text].length;
}

export type LongPasteDecision =
  | { kind: 'keep'; draft: string }
  | { kind: 'upload-text'; draft: string; text: string; fileName: string };

export function resolveLongTextPaste(params: {
  before: string;
  after: string;
  attachments: Pick<ComposerAttachmentFixture, 'fileName'>[];
  thresholdCodePoints: number;
}): LongPasteDecision {
  const inserted = findInsertedSubstring(params.before, params.after);
  if (!inserted || countCodePoints(inserted) <= params.thresholdCodePoints) {
    return { kind: 'keep', draft: params.after };
  }
  return {
    kind: 'upload-text',
    draft: draftAfterExtractingInsert(params.before, params.after, inserted),
    text: inserted,
    fileName: nextPastedTextFileName(params.attachments),
  };
}
