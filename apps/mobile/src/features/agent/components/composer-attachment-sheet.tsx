import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Box, FileText, ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { OVERLAY_MOTION_MS, OVERLAY_REDUCE_OPACITY_MS } from '@/lib/use-modal-animation-type';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { colors } from '@/lib/theme';

const MOTION_EASING = Easing.out(Easing.quad);

type ComposerAttachmentSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPickImages?: () => void;
  onPickFiles?: () => void;
  onOpenSkills?: () => void;
};

export function ComposerAttachmentSheet({
  visible,
  onClose,
  onPickImages,
  onPickFiles,
  onOpenSkills,
}: ComposerAttachmentSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const [modalShown, setModalShown] = useState(false);
  const modalMountedRef = useRef(false);
  const sheetTranslateY = useSharedValue(windowHeight);
  const scrimOpacity = useSharedValue(0);

  const hideModal = useCallback(() => {
    modalMountedRef.current = false;
    setModalShown(false);
  }, []);

  useEffect(() => {
    if (visible) {
      modalMountedRef.current = true;
      setModalShown(true);
      if (reduceMotion) {
        sheetTranslateY.value = 0;
        scrimOpacity.value = withTiming(1, {
          duration: OVERLAY_REDUCE_OPACITY_MS,
          easing: MOTION_EASING,
        });
      } else {
        sheetTranslateY.value = windowHeight;
        scrimOpacity.value = 0;
        sheetTranslateY.value = withTiming(0, {
          duration: OVERLAY_MOTION_MS,
          easing: MOTION_EASING,
        });
        scrimOpacity.value = withTiming(1, {
          duration: OVERLAY_MOTION_MS,
          easing: MOTION_EASING,
        });
      }
      return;
    }

    if (!modalMountedRef.current) {
      return;
    }

    if (reduceMotion) {
      scrimOpacity.value = withTiming(
        0,
        { duration: OVERLAY_REDUCE_OPACITY_MS, easing: MOTION_EASING },
        (finished) => {
          if (finished) {
            sheetTranslateY.value = windowHeight;
            runOnJS(hideModal)();
          }
        },
      );
    } else {
      sheetTranslateY.value = withTiming(
        windowHeight,
        { duration: OVERLAY_MOTION_MS, easing: MOTION_EASING },
        (finished) => {
          if (finished) runOnJS(hideModal)();
        },
      );
      scrimOpacity.value = withTiming(0, {
        duration: OVERLAY_MOTION_MS,
        easing: MOTION_EASING,
      });
    }
  }, [visible, windowHeight, reduceMotion, hideModal, sheetTranslateY, scrimOpacity]);

  const scrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: scrimOpacity.value,
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  return (
    <Modal visible={modalShown} transparent animationType="none" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View
          pointerEvents="box-none"
          className="absolute inset-0"
          style={[{ backgroundColor: colors.overlayScrim }, scrimAnimatedStyle]}
        >
          <Pressable className="flex-1" onPress={onClose} accessibilityLabel="关闭" />
        </Animated.View>

        <Animated.View
          className="overflow-hidden rounded-t-[20px] bg-surface"
          style={[{ paddingBottom: Math.max(insets.bottom, 12) }, sheetAnimatedStyle]}
        >
          <View className="items-center py-2.5">
            <View className="h-1 w-9 rounded-full bg-border" />
          </View>
          <Text variant="caption" className="px-4 pb-2 text-center text-muted">
            添加附件与 Skill
          </Text>

          <Pressable
            className="min-h-[52px] flex-row items-center gap-3 border-b border-composer-border px-5 active:bg-subtle"
            onPress={() => {
              onPickImages?.();
              onClose();
            }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-subtle">
              <Icon icon={ImageIcon} tone="primary" size={20} />
            </View>
            <View>
              <Text variant="body" className="font-medium">
                照片与图片
              </Text>
              <Text variant="caption" className="text-muted">
                从相册选择 PNG、JPEG、WebP
              </Text>
            </View>
          </Pressable>

          <Pressable
            className="min-h-[52px] flex-row items-center gap-3 border-b border-composer-border px-5 active:bg-subtle"
            onPress={() => {
              onOpenSkills?.();
              onClose();
            }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-subtle">
              <Icon icon={Box} tone="link" size={20} />
            </View>
            <View>
              <Text variant="body" className="font-medium">
                Skill
              </Text>
              <Text variant="caption" className="text-muted">
                从目录选择技能注入 Run
              </Text>
            </View>
          </Pressable>

          <Pressable
            className="min-h-[52px] flex-row items-center gap-3 px-5 active:bg-subtle"
            onPress={() => {
              onPickFiles?.();
              onClose();
            }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-subtle">
              <Icon icon={FileText} tone="primary" size={20} />
            </View>
            <View>
              <Text variant="body" className="font-medium">
                文件
              </Text>
              <Text variant="caption" className="text-muted">
                文档、PDF、表格等
              </Text>
            </View>
          </Pressable>

          <View className="mt-2 px-4">
            <Pressable
              className="min-h-11 items-center justify-center rounded-xl bg-subtle active:bg-[#e8e8e5]"
              onPress={onClose}
            >
              <Text variant="body" className="font-semibold text-primary">
                取消
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
