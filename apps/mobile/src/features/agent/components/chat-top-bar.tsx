import { Pressable, View } from 'react-native';
import { Menu, PanelRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { sessionFixture } from '../fixtures/ui-fixtures';
import { ConnectionPill, type ConnectionState } from './connection-pill';

type ChatTopBarProps = {
  title?: string;
  runSummary?: string;
  connectionState?: ConnectionState;
  onOpenDrawer?: () => void;
  onOpenWorkbench?: () => void;
};

export function ChatTopBar({
  title = sessionFixture.title,
  runSummary,
  connectionState = 'live',
  onOpenDrawer,
  onOpenWorkbench,
}: ChatTopBarProps) {
  const showConnectionIndicator =
    connectionState !== 'live' && connectionState !== 'idle';
  const subtitle = showConnectionIndicator ? runSummary : undefined;
  return (
    <View className="relative min-h-12 border-b border-composer-border/80 bg-canvas px-1 pb-1 pt-0.5">
      <View className="h-10 flex-row items-center">
        <Pressable
          onPress={onOpenDrawer}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-control active:bg-subtle"
          accessibilityRole="button"
          accessibilityLabel="打开会话列表"
        >
          <Icon icon={Menu} tone="primary" size={20} />
        </Pressable>

        <View className="min-w-0 flex-1 items-center px-2">
          <Text variant="body-sm" className="truncate font-semibold text-primary" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" className="truncate text-muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {showConnectionIndicator ? <ConnectionPill state={connectionState} compact /> : null}

        <Pressable
          onPress={onOpenWorkbench}
          hitSlop={8}
          className="ml-0.5 h-10 w-10 items-center justify-center rounded-control active:bg-subtle"
          accessibilityRole="button"
          accessibilityLabel="打开工作台"
        >
          <Icon icon={PanelRight} tone="primary" size={20} />
        </Pressable>
      </View>
    </View>
  );
}
