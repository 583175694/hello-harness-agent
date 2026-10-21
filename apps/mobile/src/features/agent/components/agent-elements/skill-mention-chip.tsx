import { Pressable, View } from 'react-native';
import { Box, X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

type SkillMentionChipProps = {
  name: string;
  label?: string;
  mode?: 'readonly' | 'editable';
  onRemove?: () => void;
};

export function SkillMentionChip({
  name,
  label,
  mode = 'readonly',
  onRemove,
}: SkillMentionChipProps) {
  const text = label ?? name;
  return (
    <View className="mr-1.5 mb-1.5 flex-row items-center rounded-full border border-composer-border bg-subtle px-2 py-1">
      <Icon icon={Box} tone="link" size={14} />
      <Text variant="caption" className="ml-1 text-link">
        {text}
      </Text>
      {mode === 'editable' && onRemove ? (
        <Pressable onPress={onRemove} hitSlop={6} className="ml-1 active:opacity-70">
          <Icon icon={X} tone="muted" size={12} />
        </Pressable>
      ) : null}
    </View>
  );
}
