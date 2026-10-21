import { Box, FileText, ImageIcon } from 'lucide-react-native';
import {
  ComposerSheetActionRow,
  ComposerSheetCancelRow,
  ComposerSheetFloatingCard,
} from './composer-sheet-chrome';
import { ComposerBottomDrawer } from './composer-bottom-drawer';

type AttachmentAction = {
  key: string;
  label: string;
  hint: string;
  icon: typeof ImageIcon;
  onPress: () => void;
};

type ComposerAttachmentSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Modal 完全卸载后（含关闭动画结束） */
  onDidClose?: () => void;
  onPickImages?: () => void;
  onPickFiles?: () => void;
  onOpenSkills?: () => void;
};

export function ComposerAttachmentSheet({
  visible,
  onClose,
  onDidClose,
  onPickImages,
  onPickFiles,
  onOpenSkills,
}: ComposerAttachmentSheetProps) {
  const actions: AttachmentAction[] = [
    {
      key: 'images',
      label: '照片与图片',
      hint: '从相册选择 PNG、JPEG、WebP',
      icon: ImageIcon,
      onPress: () => {
        onPickImages?.();
        onClose();
      },
    },
    {
      key: 'skill',
      label: 'Skill',
      hint: '从目录选择技能注入 Run',
      icon: Box,
      onPress: () => {
        onOpenSkills?.();
        onClose();
      },
    },
    {
      key: 'files',
      label: '文件',
      hint: '文档、PDF、表格等',
      icon: FileText,
      onPress: () => {
        onPickFiles?.();
        onClose();
      },
    },
  ];

  return (
    <ComposerBottomDrawer visible={visible} onClose={onClose} onDidClose={onDidClose} variant="bare">
      <ComposerSheetFloatingCard>
        {actions.map((action, index) => (
          <ComposerSheetActionRow
            key={action.key}
            label={action.label}
            hint={action.hint}
            icon={action.icon}
            onPress={action.onPress}
            showDivider={index < actions.length - 1}
          />
        ))}
      </ComposerSheetFloatingCard>

      <ComposerSheetFloatingCard>
        <ComposerSheetCancelRow label="取消" onPress={onClose} />
      </ComposerSheetFloatingCard>
    </ComposerBottomDrawer>
  );
}
