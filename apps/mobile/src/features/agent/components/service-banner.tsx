import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

export type ServiceState = 'checking' | 'ready' | 'unavailable';

type ServiceBannerProps = {
  state: ServiceState;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ServiceBanner({ state, onRetry, onDismiss }: ServiceBannerProps) {
  if (state === 'ready') return null;

  const message =
    state === 'checking' ? '正在检查服务状态…' : '无法连接 Agent 服务，请检查 API 地址或网络。';

  return (
    <View className="border-b border-composer-border bg-rejection px-3 py-2">
      <Text variant="body-sm" className="text-rejection-text">
        {message}
      </Text>
      <View className="mt-2 flex-row gap-3">
        {state === 'unavailable' && onRetry ? (
          <Pressable onPress={onRetry} className="active:opacity-70">
            <Text variant="caption" className="font-semibold text-link">
              重新连接
            </Text>
          </Pressable>
        ) : null}
        {onDismiss ? (
          <Pressable onPress={onDismiss} className="active:opacity-70">
            <Text variant="caption" className="text-secondary">
              关闭
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
