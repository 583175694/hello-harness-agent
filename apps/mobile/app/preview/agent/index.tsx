import { Link } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { MOBILE_PREVIEW_STATES } from '@/features/agent/fixtures/mobile-preview';

/** 与 Web `/agent/preview?state=` 对齐的状态列表 */
export default function AgentPreviewIndexScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-2 p-4 pt-16">
      <Text variant="headline">Agent Preview 状态</Text>
      <Text variant="body-sm" className="mb-2 text-secondary">
        与 Web `PREVIEW_STATES` 一一对应，用于检查对话块、Composer 与 Workbench。
      </Text>
      {MOBILE_PREVIEW_STATES.map((item) => (
        <Link key={item.id} href={`/preview/agent/${item.id}`} asChild>
          <Pressable className="rounded-control border border-border bg-surface px-4 py-3 active:bg-subtle">
            <Text variant="body" className="font-medium">
              {item.label}
            </Text>
            <Text variant="caption" className="font-mono text-muted">
              {item.id}
            </Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
