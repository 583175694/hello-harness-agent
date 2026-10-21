import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Menu, PanelRight, Settings } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { sessionFixture } from '../fixtures/ui-fixtures';
import { ConnectionPill, type ConnectionState } from './connection-pill';

type ChatTopBarProps = {
  title?: string;
  underOverlay?: boolean;
  workbenchCount?: number;
  runSummary?: string;
  connectionState?: ConnectionState;
  onOpenDrawer?: () => void;
  onOpenWorkbench?: () => void;
};

export function ChatTopBar({
  title = sessionFixture.title,
  underOverlay = false,
  workbenchCount = 0,
  runSummary,
  connectionState = 'live',
  onOpenDrawer,
  onOpenWorkbench,
}: ChatTopBarProps) {
  const router = useRouter();
  const badge = workbenchCount > 0 ? ` (${workbenchCount})` : '';

  return (
    <View
      className="relative min-h-12 border-b border-composer-border/80 bg-canvas px-1 pb-1 pt-0.5"
      style={underOverlay ? { zIndex: 0, elevation: 0 } : undefined}
      pointerEvents={underOverlay ? 'none' : 'auto'}
    >
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
          {runSummary ? (
            <Text variant="caption" className="truncate text-muted" numberOfLines={1}>
              {runSummary}
            </Text>
          ) : null}
        </View>

        <ConnectionPill state={connectionState} compact />

        <Pressable
          onPress={onOpenWorkbench}
          hitSlop={8}
          className="ml-1 h-10 max-w-[120px] flex-row items-center justify-end rounded-control px-1 active:bg-subtle"
          accessibilityRole="button"
          accessibilityLabel={`打开工作台${badge}`}
        >
          <Text variant="caption" className="font-medium text-primary" numberOfLines={1}>
            工作台{badge}
          </Text>
          <Icon icon={PanelRight} tone="primary" size={18} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/settings')}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-control active:bg-subtle"
          accessibilityLabel="设置"
        >
          <Icon icon={Settings} tone="secondary" size={18} />
        </Pressable>
      </View>
    </View>
  );
}
