import { useEffect } from 'react';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { OVERLAY_MOTION_MS, OVERLAY_REDUCE_OPACITY_MS } from '@/lib/use-modal-animation-type';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const MOTION_EASING = Easing.out(Easing.quad);

/** Overlay 内容自底部滑入 + scrim 淡入（打开时；关闭仍即时卸载）。 */
export function useOverlaySlideUp(visible: boolean) {
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(24);
  const scrimOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      translateY.value = 24;
      scrimOpacity.value = 0;
      return;
    }
    if (reduceMotion) {
      translateY.value = 0;
      scrimOpacity.value = 1;
      return;
    }
    scrimOpacity.value = withTiming(1, {
      duration: OVERLAY_REDUCE_OPACITY_MS,
      easing: MOTION_EASING,
    });
    translateY.value = withTiming(0, {
      duration: OVERLAY_MOTION_MS,
      easing: MOTION_EASING,
    });
  }, [reduceMotion, scrimOpacity, translateY, visible]);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const scrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: scrimOpacity.value,
  }));

  return { contentAnimatedStyle, scrimAnimatedStyle };
}
