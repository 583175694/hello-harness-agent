import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  MEMORY_KIND_LABEL,
  type MemoryFixture,
  type MemoryKind,
} from '@/features/agent/fixtures/memory-fixtures';
import { useMemoryLocal } from '@/features/agent/providers/memory-local-provider';

const KINDS = Object.keys(MEMORY_KIND_LABEL) as MemoryKind[];

export default function MemoryFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { memories, upsertMemory } = useMemoryLocal();
  const editing = useMemo(
    () => (id ? memories.find((m) => m.memoryId === id) : undefined),
    [id, memories],
  );

  const [kind, setKind] = useState<MemoryKind>('preference');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (editing) {
      setKind(editing.kind);
      setTitle(editing.title);
      setContent(editing.summary);
    }
  }, [editing]);

  const handleSave = () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('请填写标题与内容');
      return;
    }
    const memory: MemoryFixture = {
      memoryId: editing?.memoryId ?? `mem-local-${Date.now()}`,
      kind,
      title: title.trim(),
      summary: content.trim(),
      indexingStatus: 'ready',
    };
    upsertMemory(memory);
    Alert.alert('已保存', '（本地演示，未同步服务端）', [{ text: '好的', onPress: () => router.back() }]);
  };

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
      <View className="rounded-panel border border-border bg-surface p-4">
        <Text variant="body-sm" className="mb-2 font-medium">
          类型
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {KINDS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              className={`rounded-full border px-3 py-1.5 ${
                kind === k ? 'border-primary bg-subtle' : 'border-border bg-canvas'
              }`}
            >
              <Text variant="caption">{MEMORY_KIND_LABEL[k]}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="rounded-panel border border-border bg-surface p-4">
        <Text variant="body-sm" className="mb-2 font-medium">
          标题
        </Text>
        <Input value={title} onChangeText={setTitle} placeholder="简短标题" />
      </View>

      <View className="rounded-panel border border-border bg-surface p-4">
        <Text variant="body-sm" className="mb-2 font-medium">
          内容
        </Text>
        <Input
          value={content}
          onChangeText={setContent}
          placeholder="记忆摘要"
          multiline
          className="min-h-[120px] py-2"
          textAlignVertical="top"
        />
      </View>

      <Pressable
        onPress={handleSave}
        className="items-center rounded-control bg-primary py-3 active:bg-primary-pressed"
      >
        <Text variant="body-sm" className="font-semibold text-primary-foreground">
          保存
        </Text>
      </Pressable>
    </ScrollView>
  );
}
