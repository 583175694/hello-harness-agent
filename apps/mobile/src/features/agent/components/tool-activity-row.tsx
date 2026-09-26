import { Pressable, View } from 'react-native';
import { ChevronRight, LoaderCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import type { ToolActivityFixture } from '../fixtures/ui-fixtures';

type ToolActivityRowProps = {
  item: ToolActivityFixture;
  onPress?: () => void;
};

export function ToolActivityRow({ item, onPress }: ToolActivityRowProps) {
  const status = item.status ?? 'completed';
  const dotColor =
    status === 'running'
      ? '#fbbf24'
      : status === 'failed'
        ? '#984b41'
        : status === 'cancelled'
          ? '#898986'
          : '#4ade80';

  return (
    <Pressable
      onPress={onPress}
      className="min-h-10 flex-row items-center justify-between rounded-control border border-composer-border bg-surface px-3 py-2 active:bg-canvas"
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {status === 'running' ? (
          <LoaderCircle size={14} color="#fbbf24" />
        ) : (
          <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
        )}
        <Text variant="mono" className="font-medium">
          {item.name}
        </Text>
        <Text variant="mono" className="flex-1 text-muted" numberOfLines={1}>
          {item.summary}
        </Text>
      </View>
      <View className="ml-2 flex-row items-center gap-1">
        {item.statusLabel ? (
          <View
            className={
              status === 'failed'
                ? 'rounded bg-rejection px-1.5 py-0.5'
                : status === 'cancelled'
                  ? 'rounded bg-subtle px-1.5 py-0.5'
                  : 'rounded bg-approval px-1.5 py-0.5'
            }
          >
            <Text
              variant="caption"
              className={
                status === 'failed'
                  ? 'font-medium text-rejection-text'
                  : status === 'cancelled'
                    ? 'text-muted'
                    : 'font-medium text-approval-text'
              }
            >
              {item.statusLabel}
            </Text>
          </View>
        ) : (
          <Text variant="caption" className="font-mono text-muted">
            {item.duration}
          </Text>
        )}
        <ChevronRight size={14} color="#c4c7c7" />
      </View>
    </Pressable>
  );
}
