import { Pressable, View } from 'react-native';
import { Menu, PanelRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { sessionFixture } from '../fixtures/ui-fixtures';

type ChatTopBarProps = {
  title?: string;
  onOpenDrawer?: () => void;
  onOpenWorkbench?: () => void;
};

export function ChatTopBar({
  title = sessionFixture.title,
  onOpenDrawer,
  onOpenWorkbench,
}: ChatTopBarProps) {
  return (
    <View
      className="relative h-12 flex-row items-center border-b border-composer-border/80 bg-canvas px-1"
      style={{ zIndex: 20, elevation: 20 }}
    >
      <Pressable
        onPress={onOpenDrawer}
        hitSlop={8}
        className="h-10 w-10 items-center justify-center rounded-control active:bg-subtle"
        accessibilityRole="button"
        accessibilityLabel="打开会话列表"
      >
        <Menu size={22} color="#171717" />
      </Pressable>

      <View pointerEvents="none" className="absolute inset-x-10 inset-y-0 items-center justify-center px-2">
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
        <PanelRight size={20} color="#171717" />
      </Pressable>
    </View>
  );
}
