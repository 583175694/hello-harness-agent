import { LoaderCircle } from 'lucide-react-native';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/icon';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import type { IconTextWeight, IconTone } from '@/lib/theme';

const SPIN_MS = 1000;

type SpinnerIconProps = {
  tone?: IconTone;
  size?: number;
  textWeight?: IconTextWeight;
  style?: StyleProp<ViewStyle>;
};

export function SpinnerIcon({
  tone = 'secondary',
  size = 16,
  textWeight = 'regular',
  style,
}: SpinnerIconProps) {
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      rotation.value = 0;
      return;
    }
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, { duration: SPIN_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [reduceMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (reduceMotion) {
    return <Icon icon={LoaderCircle} tone={tone} size={size} textWeight={textWeight} style={style} />;
  }

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Icon icon={LoaderCircle} tone={tone} size={size} textWeight={textWeight} />
    </Animated.View>
  );
}
