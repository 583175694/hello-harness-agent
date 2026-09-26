import type { ReactNode } from 'react';
import { View } from 'react-native';
import { HarnessGlyph } from '@/components/agent-elements/harness-glyph';
import { Text } from '@/components/ui/text';

type AssistantMessageBlockProps = {
  children: ReactNode;
  streaming?: boolean;
  showStreamingHint?: boolean;
  deliveryStatus?: 'streaming' | 'completed' | 'failed' | 'cancelled';
  errorDetail?: string;
  completed?: boolean;
};

export function AssistantMessageBlock({
  children,
  streaming,
  showStreamingHint = true,
  deliveryStatus,
  errorDetail,
  completed,
}: AssistantMessageBlockProps) {
  return (
    <View className="gap-2.5">
      <View className="flex-row items-center gap-2">
        <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
          <HarnessGlyph size={14} color="#ffffff" />
        </View>
        <Text variant="body-sm" className="font-medium text-primary">
          Harness
        </Text>
      </View>

      {deliveryStatus === 'cancelled' ? (
        <Text variant="body-sm" className="text-secondary">
          本次回答已取消
        </Text>
      ) : null}
      {deliveryStatus === 'failed' ? (
        <Text variant="body-sm" className="text-rejection-text">
          本次回答未完成{errorDetail ? `：${errorDetail}` : ''}
        </Text>
      ) : null}
      {streaming && showStreamingHint ? (
        <Text variant="body-sm" className="text-muted">
          思考中…
        </Text>
      ) : null}

      {children}

      {completed ? (
        <Text variant="caption" className="pt-1 text-muted">
          ✓ 任务已完成
        </Text>
      ) : null}
    </View>
  );
}
