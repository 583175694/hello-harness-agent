import { Link, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { MEMORY_KIND_LABEL } from '@/features/agent/fixtures/memory-fixtures';
import { useMemoryLocal } from '@/features/agent/providers/memory-local-provider';

function indexingHint(status: 'ready' | 'pending' | 'failed'): string | null {
  if (status === 'failed') return '索引失败';
  if (status === 'pending') return '索引中';
  return null;
}

export default function MemoryListScreen() {
  const router = useRouter();
  const { memories, deleteMemory } = useMemoryLocal();

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4 pb-24">
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
                  {MEMORY_KIND_LABEL[memory.kind]}
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
                    onPress: () => deleteMemory(memory.memoryId),
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
        <Pressable className="mt-2 flex-row items-center justify-center gap-2 rounded-control bg-primary py-3 active:bg-primary-pressed">
          <Icon icon={Plus} tone="onPrimary" size={18} />
          <Text variant="body-sm" className="font-semibold text-primary-foreground">
            新增记忆
          </Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
