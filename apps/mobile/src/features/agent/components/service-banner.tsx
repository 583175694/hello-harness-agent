import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

export type ServiceState = 'checking' | 'ready' | 'unavailable';

type ServiceBannerProps = {
  state: ServiceState;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ServiceBanner({ state, onRetry }: ServiceBannerProps) {
  if (state === 'ready') return null;

  const message =
    state === 'checking' ? '正在检查服务状态…' : '当前无法连接服务，请检查网络与 API 地址。';

  return (
    <View className="flex-row items-center bg-[#FCECEA] px-3 py-2.5 dark:bg-[#2A2221]">
      <View className="mr-2 h-[18px] w-[18px] items-center justify-center rounded-full bg-rejection-text">
        <Text className="text-[11px] font-bold leading-none text-white">!</Text>
      </View>
      <Text variant="body-sm" className="min-w-0 flex-1 text-[#6B5B58] dark:text-[#C4B8B5]" numberOfLines={2}>
        {message}
      </Text>
      {state === 'unavailable' && onRetry ? (
        <Pressable onPress={onRetry} className="ml-2 shrink-0 active:opacity-70">
          <Text variant="body-sm" className="font-normal text-link">
            重新连接
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
