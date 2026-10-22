import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  type StyleProp,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OVERLAY_MOTION_MS, OVERLAY_REDUCE_OPACITY_MS } from '@/lib/use-modal-animation-type';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { useThemeColors } from '@/lib/use-theme-colors';
import { cn } from '@/lib/cn';

const MOTION_EASING = Easing.out(Easing.quad);

export type ComposerBottomDrawerProps = {
  visible: boolean;
  onClose: () => void;
  /** Modal 完全卸载后（含关闭动画结束） */
  onDidClose?: () => void;
  children: ReactNode;
  /**
   * `panel` — 全宽圆顶白底抽屉（Skill / 模型）
   * `bare` — 仅动画容器 + 安全区，内容由子组件排版（附件浮卡）
   */
  variant?: 'panel' | 'bare';
  panelMaxHeightClassName?: string;
  sheetClassName?: string;
  sheetStyle?: StyleProp<ViewStyle>;
};

export function ComposerBottomDrawer({
  visible,
  onClose,
  onDidClose,
  children,
  variant = 'panel',
  panelMaxHeightClassName = 'max-h-[70%]',
  sheetClassName,
  sheetStyle,
}: ComposerBottomDrawerProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const themeColors = useThemeColors();

  const [modalShown, setModalShown] = useState(false);
  const modalMountedRef = useRef(false);
  const closeAnimationActiveRef = useRef(false);
  const onDidCloseRef = useRef(onDidClose);
  onDidCloseRef.current = onDidClose;
  const sheetTranslateY = useSharedValue(windowHeight);
  const scrimOpacity = useSharedValue(0);

  const hideModal = useCallback(() => {
    closeAnimationActiveRef.current = false;
    modalMountedRef.current = false;
    setModalShown(false);
    onDidCloseRef.current?.();
  }, []);

  useEffect(() => {
    if (visible) {
      closeAnimationActiveRef.current = false;
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

    if (!modalMountedRef.current || closeAnimationActiveRef.current) {
      return;
    }
    closeAnimationActiveRef.current = true;

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

  const bottomPad = Math.max(insets.bottom, 10);

  const resolvedSheetClassName =
    variant === 'panel'
      ? cn(
          'rounded-t-sheetTop border border-b-0 border-composer-border bg-surface',
          panelMaxHeightClassName,
          sheetClassName,
        )
      : cn('gap-2 px-3', sheetClassName);

  return (
    <Modal visible={modalShown} transparent animationType="none" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View
          pointerEvents="box-none"
          className="absolute inset-0"
          style={[{ backgroundColor: themeColors.overlayScrim }, scrimAnimatedStyle]}
        >
          <Pressable className="flex-1" onPress={onClose} accessibilityLabel="关闭" />
        </Animated.View>

        <Animated.View
          className={resolvedSheetClassName}
          style={[
            sheetAnimatedStyle,
            { paddingBottom: bottomPad },
            sheetStyle,
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
