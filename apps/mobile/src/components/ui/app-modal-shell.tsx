import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/use-reduced-motion';

const MODAL_MOTION_MS = 240;

type AppModalShellProps = {
  visible: boolean;
  onDismiss: () => void;
  /** 点击蒙层关闭；表单类可设为 false。 */
  dismissOnScrimPress?: boolean;
  children: ReactNode;
};

/** 应用内居中浮层：25% 蒙层 + 设置风卡片容器（与重命名/确认共用）。 */
export function AppModalShell({
  visible,
  onDismiss,
  dismissOnScrimPress = true,
  children,
}: AppModalShellProps) {
  const reduceMotion = useReducedMotion();

  if (!visible) return null;

  const backdropEnter = reduceMotion ? FadeIn.duration(120) : FadeIn.duration(MODAL_MOTION_MS);
  const cardEnter = reduceMotion
    ? FadeIn.duration(120)
    : FadeInDown.duration(MODAL_MOTION_MS).springify().damping(22).stiffness(280);
  const backdropExit = reduceMotion ? FadeOut.duration(100) : FadeOut.duration(180);
  const cardExit = reduceMotion ? FadeOut.duration(100) : FadeOutDown.duration(180);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <View className="flex-1 items-center justify-center px-4">
        <Animated.View
          entering={backdropEnter}
          exiting={backdropExit}
          className="absolute inset-0 bg-black/25"
        >
          {dismissOnScrimPress ? (
            <Pressable className="flex-1" onPress={onDismiss} accessibilityLabel="关闭" />
          ) : (
            <View className="flex-1" />
          )}
        </Animated.View>
        <Animated.View
          entering={cardEnter}
          exiting={cardExit}
          className="w-full max-w-sm rounded-panel border border-border bg-surface p-4"
          style={styles.card}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    zIndex: 1,
  },
});
