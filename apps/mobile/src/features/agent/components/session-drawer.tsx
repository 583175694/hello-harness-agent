import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ChevronLeft, Plus, Search, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { OVERLAY_MOTION_MS, OVERLAY_REDUCE_OPACITY_MS } from '@/lib/use-modal-animation-type';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { colors } from '@/lib/theme';
import { sessionDrawerFixture, type SessionDrawerItemFixture } from '../fixtures/ui-fixtures';

const PANEL_WIDTH_RATIO = 0.78;
const MOTION_EASING = Easing.out(Easing.quad);

type SessionDrawerProps = {
  visible: boolean;
  /** Skip slide-out when navigating forward (e.g. Settings push). */
  exitInstant?: boolean;
  onClose?: () => void;
  onOpenSettings?: () => void;
};

function SessionDrawerRow({ item }: { item: SessionDrawerItemFixture }) {
  return (
    <Pressable
      className={cn(
        'relative min-h-11 justify-center rounded-lg px-3 py-2.5',
        item.active ? 'bg-[#eaeae6]' : 'active:bg-subtle',
      )}
    >
      <View className="flex-row items-center gap-2">
        {item.running ? <View className="h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" /> : null}
        <View className="min-w-0 flex-1 flex-row items-baseline justify-between gap-2">
          <Text
            variant="body-sm"
            className={cn('flex-1 truncate', item.active ? 'font-semibold' : 'font-medium')}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text variant="caption" className="shrink-0 text-muted">
            {item.time}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function SessionDrawer({
  visible,
  exitInstant = false,
  onClose,
  onOpenSettings,
}: SessionDrawerProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const panelWidth = useMemo(() => windowWidth * PANEL_WIDTH_RATIO, [windowWidth]);
  const reduceMotion = useReducedMotion();

  const [modalShown, setModalShown] = useState(false);
  const modalMountedRef = useRef(false);
  const panelTranslateX = useSharedValue(-panelWidth);
  const scrimOpacity = useSharedValue(0);

  const hideModal = useCallback(() => {
    modalMountedRef.current = false;
    setModalShown(false);
  }, []);

  useEffect(() => {
    panelTranslateX.value = -panelWidth;
  }, [panelWidth, panelTranslateX]);

  useEffect(() => {
    if (visible) {
      modalMountedRef.current = true;
      setModalShown(true);
      if (reduceMotion) {
        panelTranslateX.value = 0;
        scrimOpacity.value = withTiming(1, {
          duration: OVERLAY_REDUCE_OPACITY_MS,
          easing: MOTION_EASING,
        });
      } else {
        panelTranslateX.value = -panelWidth;
        scrimOpacity.value = 0;
        scrimOpacity.value = withTiming(1, {
          duration: OVERLAY_MOTION_MS,
          easing: MOTION_EASING,
        });
        panelTranslateX.value = withTiming(0, {
          duration: OVERLAY_MOTION_MS,
          easing: MOTION_EASING,
        });
      }
      return;
    }

    if (!modalMountedRef.current) {
      return;
    }

    if (exitInstant) {
      panelTranslateX.value = -panelWidth;
      scrimOpacity.value = 0;
      hideModal();
      return;
    }

    if (reduceMotion) {
      scrimOpacity.value = withTiming(
        0,
        { duration: OVERLAY_REDUCE_OPACITY_MS, easing: MOTION_EASING },
        (finished) => {
          if (finished) {
            panelTranslateX.value = -panelWidth;
            runOnJS(hideModal)();
          }
        },
      );
    } else {
      panelTranslateX.value = withTiming(
        -panelWidth,
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
  }, [visible, exitInstant, panelWidth, reduceMotion, hideModal, panelTranslateX, scrimOpacity]);

  const panelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panelTranslateX.value }],
  }));

  const scrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: scrimOpacity.value,
  }));

  const pinned = sessionDrawerFixture.filter((item) => item.pinned);
  const recent = sessionDrawerFixture.filter((item) => !item.pinned);

  return (
    <Modal visible={modalShown} animationType="none" transparent onRequestClose={onClose}>
      <View className="flex-1">
        <Animated.View
          pointerEvents="box-none"
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: colors.overlayScrim,
            },
            scrimAnimatedStyle,
          ]}
        />

        <Pressable
          className="absolute bottom-0 right-0 top-0 items-center active:opacity-90"
          style={{ left: panelWidth, paddingTop: insets.top }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="关闭会话列表"
        >
          <View className="mt-2 h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40">
            <Icon icon={ChevronLeft} tone="overlayInverse" size={18} />
          </View>
        </Pressable>

        <Animated.View
          className="border-r border-composer-border bg-drawer shadow-2xl"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: panelWidth,
              paddingTop: insets.top,
            },
            panelAnimatedStyle,
          ]}
        >
          <View className="flex-1 px-4 pt-4">
            <Pressable
              className="mb-3 min-h-11 flex-row items-center gap-2 rounded-lg active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="新建会话"
            >
              <Icon icon={Plus} tone="primary" size={20} textWeight="semibold" />
              <Text variant="body" className="font-semibold text-primary">
                新对话
              </Text>
            </Pressable>

            <View className="relative mb-3">
              <View className="pointer-events-none absolute bottom-0 left-3 top-0 justify-center">
                <Icon icon={Search} tone="muted" size={16} />
              </View>
              <Input className="h-10 pl-9" placeholder="搜索会话" />
            </View>

            <ScrollView
              className="flex-1"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              overScrollMode="never"
              keyboardShouldPersistTaps="handled"
            >
              {pinned.length > 0 ? (
                <View className="mb-3">
                  <Text variant="caption" className="mb-1 px-1 text-muted">
                    置顶
                  </Text>
                  {pinned.map((item) => (
                    <SessionDrawerRow key={item.id} item={item} />
                  ))}
                </View>
              ) : null}

              <View>
                <Text variant="caption" className="mb-1 px-1 text-muted">
                  最近
                </Text>
                {recent.map((item) => (
                  <SessionDrawerRow key={item.id} item={item} />
                ))}
              </View>
            </ScrollView>
          </View>

          <View
            className="border-t border-composer-border px-4 pt-2"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <Pressable
              onPress={onOpenSettings}
              className="min-h-11 flex-row items-center gap-2.5 rounded-lg px-1 active:bg-subtle"
              accessibilityRole="button"
              accessibilityLabel="设置"
            >
              <Icon icon={Settings} tone="secondary" size={20} />
              <Text variant="body-sm" className="font-medium text-primary">
                设置
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
