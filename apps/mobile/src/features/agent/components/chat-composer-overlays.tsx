import { View } from 'react-native';

import { ComposerAttachmentSheet } from './composer-attachment-sheet';
import { ComposerSkillPickerSheet } from './composer-skill-picker-sheet';

type ChatComposerOverlaysProps = {
  attachmentSheetOpen: boolean;
  onAttachmentSheetOpenChange: (open: boolean) => void;
  onAttachmentSheetDidClose: () => void;
  closeAttachmentSheetThen: (next: () => void) => void;
  skillPickerOpen: boolean;
  onSkillPickerOpenChange: (open: boolean) => void;
  selectedSkills: string[];
  onToggleSkill: (name: string) => void;
  onPickImages?: () => void;
  onPickFiles?: () => void;
};

export function ChatComposerOverlays({
  attachmentSheetOpen,
  onAttachmentSheetOpenChange,
  onAttachmentSheetDidClose,
  closeAttachmentSheetThen,
  skillPickerOpen,
  onSkillPickerOpenChange,
  selectedSkills,
  onToggleSkill,
  onPickImages,
  onPickFiles,
}: ChatComposerOverlaysProps) {
  return (
    <View className="absolute inset-0 z-[150]" pointerEvents="box-none">
      <ComposerAttachmentSheet
        presentation="overlay"
        visible={attachmentSheetOpen}
        onClose={() => onAttachmentSheetOpenChange(false)}
        onDidClose={onAttachmentSheetDidClose}
        onOpenSkills={() => closeAttachmentSheetThen(() => onSkillPickerOpenChange(true))}
        onPickImages={onPickImages}
        onPickFiles={onPickFiles}
      />
      <ComposerSkillPickerSheet
        presentation="overlay"
        visible={skillPickerOpen}
        selected={selectedSkills}
        onClose={() => onSkillPickerOpenChange(false)}
        onToggleSkill={onToggleSkill}
      />
    </View>
  );
}
