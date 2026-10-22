import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  MEMORY_KIND_LABEL,
  type MemoryKind,
} from '@/features/agent/fixtures/memory-fixtures';
import { useMemoryApi } from '@/features/agent/providers/memory-api-provider';

const KINDS = Object.keys(MEMORY_KIND_LABEL) as MemoryKind[];

export default function MemoryFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { memories, saveMemory } = useMemoryApi();
  const editing = useMemo(
    () => (id ? memories.find((m) => m.memoryId === id) : undefined),
    [id, memories],
  );

  const [kind, setKind] = useState<string>('preference');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    void saveMemory({
      memoryId: editing?.memoryId,
      kind,
      title: title.trim(),
      content: content.trim(),
    })
      .then(() => {
        Alert.alert('已保存', undefined, [{ text: '好的', onPress: () => router.back() }]);
      })
      .catch((requestError: unknown) => {
        Alert.alert(
          '保存失败',
          requestError instanceof Error ? requestError.message : '请稍后重试',
        );
      })
      .finally(() => {
        setSaving(false);
      });
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
          placeholder="记忆正文"
          multiline
          className="min-h-[120px] py-2"
          textAlignVertical="top"
        />
      </View>

      <Button
        label={saving ? '保存中…' : '保存'}
        disabled={saving}
        onPress={handleSave}
        className="min-h-12 w-full"
        textClassName="font-semibold"
      />
    </ScrollView>
  );
}
