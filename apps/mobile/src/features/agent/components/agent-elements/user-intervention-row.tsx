import { View } from 'react-native';
import { CornerDownLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/text';

/** 对话时间线中的 Steer / 用户干预块（protocol: user_intervention） */
export function UserInterventionRow({ content }: { content: string }) {
  return (
    <View className="flex-row items-start gap-2 rounded-control border border-dashed border-border bg-canvas px-3 py-2">
      <CornerDownLeft size={16} color="#555551" />
      <Text variant="body-sm" className="flex-1 text-secondary">
        {content}
      </Text>
    </View>
  );
}
