import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, PASTE_COMMAND, type PasteCommandType } from 'lexical';
import { useEffect, useRef } from 'react';

import type { FileRef } from '@harness/agent-protocol';
import { handleComposerAttachmentPaste } from './composer-attachment-paste';

export function ComposerAttachmentPastePlugin({
  canPasteAttachments,
  attachments,
  onAttachmentSelected,
}: {
  canPasteAttachments: boolean;
  attachments: FileRef[];
  onAttachmentSelected?: (files: File[]) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const attachmentsRef = useRef(attachments);
  const onAttachmentSelectedRef = useRef(onAttachmentSelected);
  const canPasteAttachmentsRef = useRef(canPasteAttachments);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(() => {
    onAttachmentSelectedRef.current = onAttachmentSelected;
  }, [onAttachmentSelected]);
  useEffect(() => {
    canPasteAttachmentsRef.current = canPasteAttachments;
  }, [canPasteAttachments]);

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: PasteCommandType) => {
        if (!(event instanceof ClipboardEvent)) return false;
        return handleComposerAttachmentPaste(
          event,
          canPasteAttachmentsRef.current,
          attachmentsRef.current,
          onAttachmentSelectedRef.current,
        );
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}