import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ContextJsonTree } from './context-json-tree';

export function WorkbenchContextView() {
  return (
    <View className="p-3">
      <Text variant="caption" className="mb-2 text-muted">
        Round 3 · ~12.4k tokens · compactionTriggered
      </Text>
      <ContextJsonTree />
    </View>
  );
}
