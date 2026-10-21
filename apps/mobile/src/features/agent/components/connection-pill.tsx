import { View } from 'react-native';
import { Text } from '@/components/ui/text';

export type ConnectionState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline';

const LABEL: Record<ConnectionState, string> = {
  idle: '空闲',
  connecting: '连接中',
  live: '已连接',
  reconnecting: '重连中',
  offline: '离线',
};

const DOT: Record<ConnectionState, string> = {
  idle: 'bg-muted',
  connecting: 'bg-warning',
  live: 'bg-approval-text',
  reconnecting: 'bg-warning',
  offline: 'bg-rejection-text',
};

type ConnectionPillProps = {
  state: ConnectionState;
  compact?: boolean;
};

export function ConnectionPill({ state, compact = false }: ConnectionPillProps) {
  if (compact) {
    return <View className={`h-2 w-2 rounded-full ${DOT[state]}`} accessibilityLabel={LABEL[state]} />;
  }
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-subtle px-2 py-0.5">
      <View className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} />
      <Text variant="caption" className="text-secondary">
        {LABEL[state]}
      </Text>
    </View>
  );
}
