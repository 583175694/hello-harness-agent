import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';

export function WorkbenchContextView() {
  return (
    <ScrollView className="max-h-48" contentContainerClassName="p-3">
      <Text variant="caption" className="mb-2 text-muted">
        Round 3 · ~12.4k tokens · compactionTriggered
      </Text>
      <View className="rounded-control bg-terminal p-3">
        <Text variant="mono" className="text-zinc-300">
          {`{\n  "model": "deepseek-chat",\n  "mcpCatalogStale": false,\n  "compaction": { "prefixHash": "a3f2…" }\n}`}
        </Text>
      </View>
    </ScrollView>
  );
}
