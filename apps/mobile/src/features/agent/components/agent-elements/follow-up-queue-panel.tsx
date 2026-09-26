import { Pressable, View } from 'react-native';
import { ArrowUp, CornerDownLeft, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';

type FollowUpItem = { id: string; content: string };

export function FollowUpQueuePanel({ items }: { items: FollowUpItem[] }) {
  return (
    <View className="gap-2">
      {items.map((item) => (
        <View
          key={item.id}
          className="flex-row items-center gap-2 rounded-panel border border-composer-border bg-canvas px-3 py-2"
        >
          <CornerDownLeft size={16} color="#555551" />
          <Text variant="body-sm" className="flex-1 text-primary">
            {item.content}
          </Text>
          <Pressable className="h-8 w-8 items-center justify-center rounded-control bg-primary">
            <ArrowUp size={14} color="#fff" />
          </Pressable>
          <Pressable className="h-8 w-8 items-center justify-center rounded-control active:bg-subtle">
            <X size={14} color="#555551" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
