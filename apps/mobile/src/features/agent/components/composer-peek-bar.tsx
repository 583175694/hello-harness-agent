import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ICON_CHEVRON_TONE } from '@/lib/theme';

type ComposerPeekBarProps = {
  title: string;
  subtitle?: string;
  onPress: () => void;
};

export function ComposerPeekBar({ title, subtitle, onPress }: ComposerPeekBarProps) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-3 mb-1 flex-row items-center gap-2 rounded-control border border-composer-border bg-surface px-3 py-2 active:bg-subtle"
    >
      <View className="h-2 w-2 rounded-full bg-approval-text" />
      <View className="min-w-0 flex-1">
        <Text variant="body-sm" className="font-medium" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" className="text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Icon icon={ChevronRight} tone={ICON_CHEVRON_TONE.push} size={16} />
    </Pressable>
  );
}
