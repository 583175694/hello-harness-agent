import { Pressable, View } from 'react-native';
import { UI_HIT_SLOP_ICON } from '@/lib/ui-hit-slop';
import { Menu, PanelRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { sessionFixture } from '../fixtures/ui-fixtures';
import { ConnectionPill, type ConnectionState } from './connection-pill';

type ChatTopBarProps = {
  title?: string;
  runSummary?: string;
  workbenchBadge?: number;
  connectionState?: ConnectionState;
  onOpenDrawer?: () => void;
  onOpenWorkbench?: () => void;
};

export function ChatTopBar({
  title = sessionFixture.title,
  runSummary: _runSummary,
  workbenchBadge = 0,
  connectionState = 'live',
  onOpenDrawer,
  onOpenWorkbench,
}: ChatTopBarProps) {
  const showConnectionIndicator =
    connectionState !== 'live' && connectionState !== 'idle';
  return (
    <View className="relative border-b border-composer-border/80 bg-canvas px-1 pb-0.5 pt-0.5">
      <View className="h-10 flex-row items-center">
        <Pressable
          onPress={onOpenDrawer}
          hitSlop={UI_HIT_SLOP_ICON}
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
        </View>

        {showConnectionIndicator ? <ConnectionPill state={connectionState} compact /> : null}

        <Pressable
          onPress={onOpenWorkbench}
          hitSlop={UI_HIT_SLOP_ICON}
          className="relative ml-0.5 h-10 w-10 items-center justify-center rounded-control active:bg-subtle"
          accessibilityRole="button"
          accessibilityLabel={
            workbenchBadge > 0 ? `打开工作台，${workbenchBadge} 项更新` : '打开工作台'
          }
        >
          <Icon icon={PanelRight} tone="primary" size={20} />
          {workbenchBadge > 0 ? (
            <View className="absolute -right-0.5 -top-0.5 min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1">
              <Text variant="caption" className="text-[10px] font-semibold text-primary-foreground">
                {workbenchBadge > 99 ? '99+' : workbenchBadge}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
