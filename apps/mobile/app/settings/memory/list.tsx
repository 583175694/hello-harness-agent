import { Link, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { MEMORY_KIND_LABEL, type MemoryKind } from '@/features/agent/fixtures/memory-fixtures';
import { useMemoryApi } from '@/features/agent/providers/memory-api-provider';

function kindLabel(kind: string): string {
  return MEMORY_KIND_LABEL[kind as MemoryKind] ?? kind;
}

function indexingHint(status: 'ready' | 'pending' | 'failed'): string | null {
  if (status === 'failed') return '索引失败';
  if (status === 'pending') return '索引中';
  return null;
}

export default function MemoryListScreen() {
  const router = useRouter();
  const { memories, deleteMemory, error } = useMemoryApi();

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4 pb-24">
      {error ? (
        <Text variant="body-sm" className="text-destructive">
          {error}
        </Text>
      ) : null}
      {memories.length === 0 ? (
        <Text variant="body-sm" className="text-center text-muted">
          暂无记忆，可点右下角新增。
        </Text>
      ) : null}
      {memories.map((memory) => {
        const hint = indexingHint(memory.indexingStatus);
        return (
          <View
            key={memory.memoryId}
            className="rounded-panel border border-border bg-surface p-4"
          >
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/settings/memory/form',
                  params: { id: memory.memoryId },
                })
              }
              className="active:opacity-80"
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text variant="caption" className="text-muted">
                  {kindLabel(memory.kind)}
                </Text>
                {hint ? (
                  <Text variant="caption" className="text-warning">
                    {hint}
                  </Text>
                ) : null}
              </View>
              <Text variant="body" className="mt-1 font-semibold">
                {memory.title}
              </Text>
              <Text variant="body-sm" className="mt-1 text-secondary" numberOfLines={2}>
                {memory.summary}
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                Alert.alert('删除记忆', `确定删除「${memory.title}」？`, [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '删除',
                    style: 'destructive',
                    onPress: () => void deleteMemory(memory.memoryId),
                  },
                ])
              }
              className="mt-3 flex-row items-center gap-1 self-start active:opacity-70"
            >
              <Icon icon={Trash2} tone="destructive" size={16} />
              <Text variant="caption" className="text-rejection-text">
                删除
              </Text>
            </Pressable>
          </View>
        );
      })}

      <Link href="/settings/memory/form" asChild>
        <PressableScale
          className="absolute bottom-6 right-4 h-14 w-14 items-center justify-center rounded-full border border-primary-pressed bg-primary"
          accessibilityLabel="新增记忆"
        >
          <Icon icon={Plus} tone="onPrimary" size={24} />
        </PressableScale>
      </Link>
    </ScrollView>
  );
}
