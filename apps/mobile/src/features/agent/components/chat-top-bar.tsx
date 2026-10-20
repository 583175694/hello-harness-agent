import { Pressable, View } from 'react-native';
import { Menu, PanelRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { sessionFixture } from '../fixtures/ui-fixtures';

type ChatTopBarProps = {
  title?: string;
  /** Workbench / 其它全屏 overlay 打开时顶栏留在 scrim 之下，避免与 Sheet 顶缘抢层级 */
  underOverlay?: boolean;
  onOpenDrawer?: () => void;
  onOpenWorkbench?: () => void;
};

export function ChatTopBar({
  title = sessionFixture.title,
  underOverlay = false,
  onOpenDrawer,
  onOpenWorkbench,
}: ChatTopBarProps) {
  return (
    <View
      className="relative h-12 flex-row items-center border-b border-composer-border/80 bg-canvas px-1"
      style={underOverlay ? { zIndex: 0, elevation: 0 } : undefined}
      pointerEvents={underOverlay ? 'none' : 'auto'}
    >
      <Pressable
        onPress={onOpenDrawer}
        hitSlop={8}
        className="h-10 w-10 items-center justify-center rounded-control active:bg-subtle"
        accessibilityRole="button"
        accessibilityLabel="打开会话列表"
      >
        <Icon icon={Menu} tone="primary" size={20} />
      </Pressable>

      <View
        pointerEvents="none"
        className="absolute inset-x-10 inset-y-0 z-[1] items-center justify-center px-2"
      >
        <Text variant="body-sm" className="truncate font-semibold text-primary" numberOfLines={1}>
          {title}
        </Text>
      </View>

      <Pressable
        onPress={onOpenWorkbench}
        hitSlop={8}
        className="ml-auto h-10 w-10 items-center justify-center rounded-control active:bg-subtle"
        accessibilityRole="button"
        accessibilityLabel="打开工作台"
      >
        <Icon icon={PanelRight} tone="primary" size={20} />
      </Pressable>
    </View>
  );
}
