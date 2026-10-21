import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BrandIcon } from '@/components/ui/brand-icon';
import { Text } from '@/components/ui/text';
import { APP_BRAND } from '@/lib/brand';

/** Match Web `.assistant-avatar--brand` + `.assistant-brand-icon` (32 / 28). */
const ASSISTANT_AVATAR_SIZE = 32;
const ASSISTANT_BRAND_ICON_SIZE = 28;

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
        <View
          className="items-center justify-center"
          style={{ width: ASSISTANT_AVATAR_SIZE, height: ASSISTANT_AVATAR_SIZE }}
        >
          <BrandIcon size={ASSISTANT_BRAND_ICON_SIZE} />
        </View>
        <Text variant="body-sm" className="font-medium text-primary">
          {APP_BRAND.name}
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
