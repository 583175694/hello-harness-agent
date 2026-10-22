import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  McpServerFormFields,
  type McpFormState,
} from '@/features/agent/components/mcp-server-form-fields';
import { useMcpServers } from '@/features/agent/hooks/use-mcp-servers';
import {
  defaultMcpFormState,
  mcpFormToUpdateRequest,
  mcpViewToForm,
} from '@/features/agent/model/mcp-form';

export default function McpEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getServer, updateServer, deleteServer, testServer, refresh, loading } = useMcpServers();
  const server = id ? getServer(id) : undefined;
  const [form, setForm] = useState<McpFormState>(() => defaultMcpFormState());
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (server) {
      setForm(mcpViewToForm(server));
    }
  }, [server]);

  if (!id) {
    return (
      <ScrollView contentContainerClassName="p-4">
        <Text>无效的服务器 ID</Text>
      </ScrollView>
    );
  }

  if (!server && !loading) {
    return (
      <ScrollView contentContainerClassName="p-4">
        <Text>未找到服务器</Text>
      </ScrollView>
    );
  }

  const handleSave = () => {
    if (!server) return;
    setBusy(true);
    void updateServer(server.id, mcpFormToUpdateRequest(form, token))
      .then(async () => {
        await refresh();
        Alert.alert('已保存', undefined, [{ text: '好的', onPress: () => router.back() }]);
      })
      .catch((requestError: unknown) => {
        Alert.alert(
          '保存失败',
          requestError instanceof Error ? requestError.message : '请检查表单',
        );
      })
      .finally(() => setBusy(false));
  };

  const handleTest = () => {
    if (!server) return;
    setBusy(true);
    void testServer(server.id)
      .then((result) => {
        Alert.alert(
          result.ok ? '连接成功' : '连接失败',
          result.ok
            ? `可用工具：${result.toolNames.length} 个`
            : (result.error ?? '未知错误'),
        );
      })
      .catch((requestError: unknown) => {
        Alert.alert(
          '测试失败',
          requestError instanceof Error ? requestError.message : '请稍后重试',
        );
      })
      .finally(() => setBusy(false));
  };

  const handleDelete = () => {
    if (!server) return;
    Alert.alert('删除服务器', `确定删除「${server.serverName}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void deleteServer(server.id)
            .then(async () => {
              await refresh();
              router.back();
            })
            .catch((requestError: unknown) => {
              Alert.alert(
                '删除失败',
                requestError instanceof Error ? requestError.message : '请稍后重试',
              );
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-10">
      <McpServerFormFields form={form} onChange={setForm} token={token} onTokenChange={setToken} />
      <Button
        label={busy ? '处理中…' : '保存'}
        disabled={busy || !server}
        onPress={handleSave}
        className="min-h-12 w-full"
        textClassName="font-semibold"
      />
      <Button
        label="测试连接"
        variant="secondary"
        disabled={busy || !server}
        onPress={handleTest}
        className="min-h-12 w-full"
      />
      <Button
        label="删除服务器"
        variant="rejection"
        disabled={busy || !server}
        onPress={handleDelete}
        className="min-h-12 w-full"
      />
    </ScrollView>
  );
}
