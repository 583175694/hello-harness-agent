import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SpinnerIcon } from '@/components/ui/spinner-icon';
import { Text } from '@/components/ui/text';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { AGENT_UI_LAYOUT } from '../../config/ui.constants';
import { catalogPlanFixture } from '../../fixtures/ui-catalog-fixtures';

const DETAIL_ENTER_MS = 200;
const DETAIL_EXIT_MS = 150;
const DETAIL_OFFSET_Y = 8;
const DETAIL_EASING = Easing.out(Easing.quad);

type PlanStep = { step: string; status: 'pending' | 'in_progress' | 'completed' };

function PlanDetailsPanel({
  open,
  onMountedChange,
  children,
}: {
  open: boolean;
  onMountedChange?: (mounted: boolean) => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(DETAIL_OFFSET_Y);

  useEffect(() => {
    onMountedChange?.(mounted);
  }, [mounted, onMountedChange]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduceMotion) {
        translateY.value = 0;
        opacity.value = withTiming(1, {
          duration: DETAIL_EXIT_MS,
          easing: DETAIL_EASING,
        });
      } else {
        opacity.value = 0;
        translateY.value = DETAIL_OFFSET_Y;
        opacity.value = withTiming(1, {
          duration: DETAIL_ENTER_MS,
          easing: DETAIL_EASING,
        });
        translateY.value = withTiming(0, {
          duration: DETAIL_ENTER_MS,
          easing: DETAIL_EASING,
        });
      }
      return;
    }

    if (!mounted) {
      return;
    }

    if (reduceMotion) {
      translateY.value = 0;
      opacity.value = withTiming(
        0,
        { duration: DETAIL_EXIT_MS, easing: DETAIL_EASING },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    } else {
      opacity.value = withTiming(0, {
        duration: DETAIL_EXIT_MS,
        easing: DETAIL_EASING,
      });
      translateY.value = withTiming(
        DETAIL_OFFSET_Y,
        { duration: DETAIL_EXIT_MS, easing: DETAIL_EASING },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [open, mounted, reduceMotion, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!mounted) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      className="absolute bottom-full left-0 right-0 mb-2 w-full rounded-sheet border border-composer-border bg-surface px-3.5 py-3"
      style={animatedStyle}
    >
      {children}
    </Animated.View>
  );
}

type PlanFloatingCardProps = {
  plan?: PlanStep[];
  explanation?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function PlanFloatingCard({
  plan = catalogPlanFixture.plan,
  explanation = catalogPlanFixture.explanation,
  open: openProp,
  onOpenChange,
}: PlanFloatingCardProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInternal;

  const setOpen = (next: boolean) => {
    if (!isControlled) {
      setOpenInternal(next);
    }
    onOpenChange?.(next);
  };

  const activeIndex = Math.max(0, plan.findIndex((s) => s.status === 'in_progress'));

  if (!plan.length || plan.every((step) => step.status === 'completed')) {
    return null;
  }

  return (
    <View
      className="w-full items-center"
      style={{ paddingHorizontal: AGENT_UI_LAYOUT.planOverlayHorizontalInsetPx }}
      accessibilityRole="summary"
    >
      <View className="relative w-full max-w-[360px] items-center">
        <PlanDetailsPanel open={open}>
        {explanation ? (
          <Text variant="caption" className="mb-2.5 text-muted">
            {explanation}
          </Text>
        ) : null}
        {plan.map((step, index) => (
          <View key={`${index}-${step.step}`} className="flex-row items-start gap-2 py-1">
            <View className="mt-0.5 w-4 items-center">
              {step.status === 'completed' ? (
                <Icon icon={Check} tone="approvalBright" size={14} />
              ) : step.status === 'in_progress' ? (
                <SpinnerIcon tone="secondary" size={14} />
              ) : (
                <View className="mt-0.5 h-2.5 w-2.5 rounded-full border border-muted" />
              )}
            </View>
            <Text
              variant="body-sm"
              className={
                step.status === 'completed'
                  ? 'flex-1 text-muted'
                  : step.status === 'in_progress'
                    ? 'flex-1 text-primary'
                    : 'flex-1 text-secondary'
              }
            >
              {step.step}
            </Text>
          </View>
        ))}
        </PlanDetailsPanel>

        <PressableScale
          scaleEnabled={false}
          onPress={() => setOpen(!open)}
          className="min-h-[38px] flex-row items-center gap-2 rounded-full border border-composer-border bg-surface px-4 py-2 active:opacity-90"
          accessibilityRole="button"
          accessibilityLabel={`执行计划，第 ${activeIndex + 1} / ${plan.length} 步`}
          accessibilityState={{ expanded: open }}
        >
          <SpinnerIcon tone="primary" size={14} textWeight="semibold" />
          <Text variant="body-sm" className="font-semibold text-primary">
            第 {activeIndex + 1} / {plan.length} 步
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}
