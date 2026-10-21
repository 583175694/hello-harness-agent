import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { AGENT_UI_BUTTON } from '../config/ui.constants';

export type ComposerSegmentOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type ComposerSegmentedControlProps<T extends string> = {
  options: ComposerSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

const { classNames: btn } = AGENT_UI_BUTTON;

/** 与 `segmentTrack` 的 `p-0.5` 对齐 */
const TRACK_INSET = 2;
const THUMB_MOTION_MS = 150;
const THUMB_EASING = Easing.out(Easing.quad);

/**
 * Composer 内分段选择（推理强度等）：subtle 轨道 + 滑动 primary 高亮块。
 */
export function ComposerSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: ComposerSegmentedControlProps<T>) {
  const reduceMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbX = useSharedValue(TRACK_INSET);

  const selectedIndex = useMemo(() => {
    const index = options.findIndex((o) => o.value === value);
    return index >= 0 ? index : 0;
  }, [options, value]);

  const segmentCount = options.length;

  const segmentWidth =
    trackWidth > 0 && segmentCount > 0
      ? (trackWidth - TRACK_INSET * 2) / segmentCount
      : 0;

  useEffect(() => {
    if (segmentWidth <= 0) {
      return;
    }
    const targetX = TRACK_INSET + selectedIndex * segmentWidth;
    if (reduceMotion) {
      thumbX.value = targetX;
    } else {
      thumbX.value = withTiming(targetX, {
        duration: THUMB_MOTION_MS,
        easing: THUMB_EASING,
      });
    }
  }, [selectedIndex, segmentWidth, reduceMotion, thumbX]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setTrackWidth(width);
    if (segmentCount > 0) {
      const segW = (width - TRACK_INSET * 2) / segmentCount;
      thumbX.value = TRACK_INSET + selectedIndex * segW;
    }
  };

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
  }));

  return (
    <View
      className={cn(btn.segmentTrack, 'relative min-h-[36px]')}
      onLayout={onTrackLayout}
      accessibilityRole="radiogroup"
    >
      <Animated.View
        pointerEvents="none"
        className={cn(btn.segmentTab, btn.segmentTabSelected, 'absolute bottom-0.5 left-0 top-0.5')}
        style={[
          thumbAnimatedStyle,
          { width: segmentWidth, opacity: segmentWidth > 0 ? 1 : 0 },
        ]}
      />

      {options.map((opt) => {
        const selected = opt.value === value;
        const disabled = opt.disabled ?? false;
        return (
          <Pressable
            key={opt.value}
            disabled={disabled}
            onPress={() => onChange(opt.value)}
            className={cn(btn.segmentTab, 'z-[1] min-h-[34px] flex-1 px-1')}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={opt.label}
          >
            <Text
              variant="caption"
              className={cn(
                'font-semibold',
                selected && !disabled
                  ? btn.segmentLabelSelected
                  : disabled
                    ? 'text-muted opacity-50'
                    : btn.segmentLabelIdle,
              )}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
