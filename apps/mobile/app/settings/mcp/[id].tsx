import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  McpServerFormFields,
  type McpFormState,
} from '@/features/agent/components/mcp-server-form-fields';
import { defaultMcpForm, mcpServerFixtures } from '@/features/agent/fixtures/mcp-fixtures';

export default function McpEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const server = useMemo(() => mcpServerFixtures.find((s) => s.id === id), [id]);
  const [form, setForm] = useState<McpFormState>(() => {
    if (!server) return defaultMcpForm();
    const { id: _id, status: _status, ...rest } = server;
    return rest;
  });
  const [token, setToken] = useState('');

  if (!server) {
    return (
      <ScrollView contentContainerClassName="p-4">
        <Text>未找到服务器</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-10">
      <McpServerFormFields form={form} onChange={setForm} token={token} onTokenChange={setToken} />
      <Pressable
        onPress={() =>
          Alert.alert('已保存', '（本地演示）', [{ text: '好的', onPress: () => router.back() }])
        }
        className="items-center rounded-control bg-primary py-3 active:bg-primary-pressed"
      >
        <Text variant="body-sm" className="font-semibold text-primary-foreground">
          保存
        </Text>
      </Pressable>
      <Pressable
        onPress={() => Alert.alert('测试连接', `「${server.serverName}」：已连接（演示）`)}
        className="items-center rounded-control border border-border bg-surface py-3 active:bg-subtle"
      >
        <Text variant="body-sm">测试连接</Text>
      </Pressable>
    </ScrollView>
  );
}
