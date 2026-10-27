import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

type AuthBannerProps = {
  onLogin: () => void;
  onDismiss?: () => void;
};

export function AuthBanner({ onLogin, onDismiss }: AuthBannerProps) {
  return (
    <View className="border-b border-composer-border bg-subtle px-3 py-2">
      <Text variant="body-sm" fixedSize>
        已连接服务，但需要登录后才能创建会话与发送消息。
      </Text>
      <View className="mt-2 flex-row gap-3">
        <Pressable onPress={onLogin} className="active:opacity-70">
          <Text variant="caption" className="font-semibold text-link">
            去登录
          </Text>
        </Pressable>
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
