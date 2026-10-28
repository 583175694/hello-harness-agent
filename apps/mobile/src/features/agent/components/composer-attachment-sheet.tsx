import { useEffect, useRef, type RefObject } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Box, FileText, ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ComposerSheetActionRow,
  ComposerSheetFloatingCard,
  ComposerSheetGrabHandle,
} from './composer-sheet-chrome';
import { ComposerBottomDrawer } from './composer-bottom-drawer';
import { useOverlaySlideUp } from '@/lib/use-overlay-slide-up';
import { useThemeColors } from '@/lib/use-theme-colors';

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
  /**
   * `overlay` — 同屏绝对定位，不用 RN Modal（iOS 上与系统 Picker 冲突更少）。
   * `modal` — 预览/旧路径。
   */
  presentation?: 'overlay' | 'modal';
  onPickImages?: () => void;
  onPickFiles?: () => void;
  onOpenSkills?: () => void;
};

function hideOverlayForSystemPicker(overlayRef: RefObject<View | null>) {
  overlayRef.current?.setNativeProps({ pointerEvents: 'none', style: { opacity: 0 } });
}

function runPickerInUserGesture(
  overlayRef: RefObject<View | null>,
  run: (() => void) | undefined,
  onClose: () => void,
) {
  hideOverlayForSystemPicker(overlayRef);
  run?.();
  onClose();
}

export function ComposerAttachmentSheet({
  visible,
  onClose,
  onDidClose,
  presentation = 'overlay',
  onPickImages,
  onPickFiles,
  onOpenSkills,
}: ComposerAttachmentSheetProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const overlayRef = useRef<View>(null);
  const wasVisibleRef = useRef(false);
  const { contentAnimatedStyle, scrimAnimatedStyle } = useOverlaySlideUp(
    visible && presentation === 'overlay',
  );

  useEffect(() => {
    if (wasVisibleRef.current && !visible) {
      onDidClose?.();
    }
    wasVisibleRef.current = visible;
  }, [visible, onDidClose]);

  const actions: AttachmentAction[] = [
    {
      key: 'images',
      label: '照片与图片',
      hint: '从相册选择 PNG、JPEG、WebP',
      icon: ImageIcon,
      onPress: () => runPickerInUserGesture(overlayRef, onPickImages, onClose),
    },
    {
      key: 'skill',
      label: 'Skill',
      hint: '从目录选择技能注入 Run',
      icon: Box,
      onPress: () => {
        onClose();
        requestAnimationFrame(() => onOpenSkills?.());
      },
    },
    {
      key: 'files',
      label: '文件',
      hint: '文档、PDF、表格等',
      icon: FileText,
      onPress: () => runPickerInUserGesture(overlayRef, onPickFiles, onClose),
    },
  ];

  const sheetBody = (
    <>
      <ComposerSheetFloatingCard>
        <ComposerSheetGrabHandle />
        {actions.map((action, index) => (
          <ComposerSheetActionRow
            key={action.key}
            label={action.label}
            hint={action.hint}
            icon={action.icon}
            onPress={action.onPress}
            showDivider={false}
          />
        ))}
      </ComposerSheetFloatingCard>

    </>
  );

  if (!visible) {
    return null;
  }

  const bottomPad = Math.max(insets.bottom, 10);

  if (presentation === 'modal') {
    return (
      <ComposerBottomDrawer visible={visible} onClose={onClose} onDidClose={onDidClose} variant="bare">
        {sheetBody}
      </ComposerBottomDrawer>
    );
  }

  return (
    <View
      ref={overlayRef}
      className="absolute inset-0 z-[100] justify-end"
      pointerEvents="box-none"
    >
      <Animated.View
        pointerEvents="auto"
        className="absolute inset-0"
        style={[{ backgroundColor: themeColors.overlayScrim }, scrimAnimatedStyle]}
      >
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="关闭" />
      </Animated.View>
      <Animated.View
        className="gap-2 px-3"
        style={[{ paddingBottom: bottomPad }, contentAnimatedStyle]}
        pointerEvents="box-none"
      >
        {sheetBody}
      </Animated.View>
    </View>
  );
}
