import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useReducedMotion } from '@/lib/use-reduced-motion';

export type SessionMenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MENU_WIDTH = 200;
const MENU_ESTIMATED_HEIGHT = 168;
const MENU_GAP = 6;
const MENU_SCALE_FROM = 0.82;
const MENU_TRANSLATE_Y = -12;

type SessionDrawerContextMenuProps = {
  visible: boolean;
  anchor: SessionMenuAnchor | null;
  pinLabel: string;
  menuKey: string | null;
  onDismiss: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
};

function MenuRow({
  label,
  icon,
  destructive = false,
  onPress,
}: {
  label: string;
  icon: typeof Pencil;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-3 px-4 active:bg-subtle-pressed"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon icon={icon} tone={destructive ? 'rejection' : 'primary'} size={18} textWeight="medium" />
      <Text
        variant="body-sm"
        className={destructive ? 'font-medium text-rejection-text' : 'font-medium text-primary'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SessionDrawerContextMenu({
  visible,
  anchor,
  pinLabel,
  menuKey,
  onDismiss,
  onRename,
  onTogglePin,
  onDelete,
}: SessionDrawerContextMenuProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const openProgress = useSharedValue(0);

  useEffect(() => {
    if (!visible || !anchor || !menuKey) {
      openProgress.value = 0;
      return;
    }
    openProgress.value = 0;
    openProgress.value = reduceMotion
      ? withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) })
      : withSpring(1, { damping: 15, stiffness: 210, mass: 0.85 });
  }, [visible, menuKey, anchor, reduceMotion, openProgress]);

  const menuAnimatedStyle = useAnimatedStyle(() => {
    const p = openProgress.value;
    const scale = MENU_SCALE_FROM + (1 - MENU_SCALE_FROM) * p;
    return {
      opacity: p,
      transform: [{ translateY: MENU_TRANSLATE_Y * (1 - p) }, { scale }],
    };
  });

  if (!visible || !anchor) return null;

  let top = anchor.y + anchor.height + MENU_GAP;
  if (top + MENU_ESTIMATED_HEIGHT > windowHeight - 16) {
    top = Math.max(16, anchor.y - MENU_ESTIMATED_HEIGHT - MENU_GAP);
  }
  const left = Math.min(Math.max(12, anchor.x), windowWidth - MENU_WIDTH - 12);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <View className="flex-1">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="关闭菜单"
        />
        <Animated.View
          key={menuKey ?? 'session-menu'}
          style={[
            menuAnimatedStyle,
            {
              position: 'absolute',
              top,
              left,
              width: MENU_WIDTH,
            },
          ]}
          className="overflow-hidden rounded-2xl border border-border bg-surface"
        >
          <MenuRow label="重命名" icon={Pencil} onPress={onRename} />
          <MenuRow label={pinLabel} icon={pinLabel.startsWith('取消') ? PinOff : Pin} onPress={onTogglePin} />
          <View className="mx-3 h-px bg-composer-border" />
          <MenuRow label="删除" icon={Trash2} destructive onPress={onDelete} />
        </Animated.View>
      </View>
    </Modal>
  );
}
