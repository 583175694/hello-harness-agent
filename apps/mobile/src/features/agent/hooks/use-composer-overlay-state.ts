import { useCallback, useRef, useState } from 'react';

/** Chat 屏根层附件 / Skill overlay 状态（与 Workbench BottomSheet 分层，避免 RN Modal 互斥）。 */
export function useComposerOverlayState() {
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const afterAttachmentSheetCloseRef = useRef<(() => void) | null>(null);

  const closeAttachmentSheetThen = useCallback((next: () => void) => {
    afterAttachmentSheetCloseRef.current = next;
    setAttachmentSheetOpen(false);
  }, []);

  const handleAttachmentSheetDidClose = useCallback(() => {
    const next = afterAttachmentSheetCloseRef.current;
    afterAttachmentSheetCloseRef.current = null;
    next?.();
  }, []);

  const toggleSkill = useCallback((name: string) => {
    setSelectedSkills((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  }, []);

  return {
    attachmentSheetOpen,
    setAttachmentSheetOpen,
    skillPickerOpen,
    setSkillPickerOpen,
    selectedSkills,
    toggleSkill,
    closeAttachmentSheetThen,
    handleAttachmentSheetDidClose,
  };
}
