import { useEffect, useState, type ReactNode } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { AGENT_UI_BUTTON } from '../config/ui.constants';

const SLIDE_MS = 240;
const SLIDE_EASING = Easing.bezier(0.22, 1, 0.36, 1);

type SlidingSegmentTrackProps = {
  segmentCount: number;
  selectedIndex: number;
  trackClassName?: string;
  minTrackHeight?: number;
  children: ReactNode;
};

/** 轨道内滑动高亮（Workbench Tab、思考强度等 equal-width 分段）。 */
export function SlidingSegmentTrack({
  segmentCount,
  selectedIndex,
  trackClassName,
  minTrackHeight = 36,
  children,
}: SlidingSegmentTrackProps) {
  const reduceMotion = useReducedMotion();
  const { classNames: btn } = AGENT_UI_BUTTON;
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useSharedValue(0);
  const pillWidth = useSharedValue(0);

  const safeCount = Math.max(segmentCount, 1);
  const clampedIndex = Math.min(Math.max(selectedIndex, 0), safeCount - 1);
  const segmentWidth = trackWidth > 0 ? trackWidth / safeCount : 0;

  useEffect(() => {
    const targetX = segmentWidth * clampedIndex;
    if (reduceMotion || segmentWidth <= 0) {
      translateX.value = targetX;
      pillWidth.value = segmentWidth;
      return;
    }
    translateX.value = withTiming(targetX, { duration: SLIDE_MS, easing: SLIDE_EASING });
    pillWidth.value = withTiming(segmentWidth, { duration: SLIDE_MS, easing: SLIDE_EASING });
  }, [clampedIndex, segmentWidth, reduceMotion, translateX, pillWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: pillWidth.value,
  }));

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      className={cn(btn.segmentTrack, trackClassName)}
      style={{ minHeight: minTrackHeight }}
    >
      <View className="relative w-full flex-1" onLayout={onTrackLayout}>
        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            className={cn(btn.segmentTabSelected, 'absolute bottom-0.5 top-0.5 rounded-[6px]')}
            style={pillStyle}
          />
        ) : null}
        {children}
      </View>
    </View>
  );
}
