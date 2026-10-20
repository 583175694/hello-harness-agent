/**
 * Primary CTA press feedback (better-ui: 0.96 scale, 150ms ease-out).
 * Prefer this over ad-hoc active:scale-* on send / approve / reject buttons.
 */
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { cn } from '@/lib/cn';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SCALE = 0.96;
const PRESS_DURATION_MS = 150;
const PRESS_EASING = Easing.out(Easing.quad);
const REDUCED_OPACITY = 0.85;

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Set false for controls that must not scale (e.g. static chrome). */
  scaleEnabled?: boolean;
};

export function PressableScale({
  children,
  className,
  style,
  disabled,
  scaleEnabled = true,
  onPressIn,
  onPressOut,
  accessibilityRole = 'button',
  ...props
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn: PressableProps['onPressIn'] = (event) => {
    if (!disabled && scaleEnabled) {
      if (reduceMotion) {
        opacity.value = withTiming(REDUCED_OPACITY, {
          duration: PRESS_DURATION_MS,
          easing: PRESS_EASING,
        });
      } else {
        scale.value = withTiming(PRESS_SCALE, {
          duration: PRESS_DURATION_MS,
          easing: PRESS_EASING,
        });
      }
    }
    onPressIn?.(event);
  };

  const handlePressOut: PressableProps['onPressOut'] = (event) => {
    if (!disabled && scaleEnabled) {
      if (reduceMotion) {
        opacity.value = withTiming(1, {
          duration: PRESS_DURATION_MS,
          easing: PRESS_EASING,
        });
      } else {
        scale.value = withTiming(1, {
          duration: PRESS_DURATION_MS,
          easing: PRESS_EASING,
        });
      }
    }
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      className={cn(className)}
      style={[style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedPressable>
  );
}
