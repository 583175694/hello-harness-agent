import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { SessionComposerBlock } from '../lib/session-composer-block';

type ComposerBlockBannerProps = {
  block: SessionComposerBlock;
  onCreateSession?: () => void;
  onDismiss?: () => void;
};

export function ComposerBlockBanner({ block, onCreateSession, onDismiss }: ComposerBlockBannerProps) {
  return (
    <View className="border-b border-composer-border bg-subtle px-3 py-2">
      <Text variant="body-sm" className="text-primary">
        {block.detail}
      </Text>
      <View className="mt-2 flex-row gap-3">
        {onCreateSession ? (
          <Pressable onPress={onCreateSession} className="active:opacity-70">
            <Text variant="caption" className="font-semibold text-link">
              新建会话
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
