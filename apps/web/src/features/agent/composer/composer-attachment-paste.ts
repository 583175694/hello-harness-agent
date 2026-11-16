import type { FileRef } from '../model/types';
import { AGENT_UI_BEHAVIOR } from '../config/ui.constants';

function nextPastedTextFileName(attachments: FileRef[]): string {
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

function normalizeAttachmentFileName(file: File, index: number): File {
  if (file.name) return file;
  if (file.type.startsWith('image/')) {
    return new File([file], `pasted-image-${index + 1}.png`, { type: file.type });
  }
  return new File([file], `dropped-file-${index + 1}`, {
    type: file.type || 'application/octet-stream',
  });
}

export function attachmentFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const direct = Array.from(dataTransfer.files).filter((file) => file.size > 0);
  if (direct.length) return direct;
  const collected: File[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && file.size > 0) collected.push(file);
  }
  return collected;
}

export function normalizeAttachmentFiles(files: File[]): File[] {
  return files.map((file, index) => normalizeAttachmentFileName(file, index));
}

/** 拦截剪贴板中的附件与超长纯文本，避免默认插入输入框。 */
export function handleComposerAttachmentPaste(
  event: ClipboardEvent,
  canPasteAttachments: boolean,
  attachments: FileRef[],
  onAttachmentSelected?: (files: File[]) => void,
): boolean {
  if (!canPasteAttachments) return false;
  const clipboardFiles = normalizeAttachmentFiles(
    attachmentFilesFromDataTransfer(event.clipboardData),
  );
  if (clipboardFiles.length) {
    event.preventDefault();
    onAttachmentSelected?.(clipboardFiles);
    return true;
  }
  const text = event.clipboardData.getData('text/plain');
  if ([...text].length <= AGENT_UI_BEHAVIOR.longPasteThresholdCodePoints) return false;
  event.preventDefault();
  onAttachmentSelected?.([
    new File([text], nextPastedTextFileName(attachments), { type: 'text/plain' }),
  ]);
  return true;
}