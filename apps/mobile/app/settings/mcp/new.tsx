import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Button } from '@/components/ui/button';
import {
  McpServerFormFields,
  type McpFormState,
} from '@/features/agent/components/mcp-server-form-fields';
import { useMcpServers } from '@/features/agent/hooks/use-mcp-servers';
import {
  defaultMcpFormState,
  mcpFormToCreateRequest,
} from '@/features/agent/model/mcp-form';

export default function McpNewScreen() {
  const router = useRouter();
  const { createServer, refresh } = useMcpServers();
  const [form, setForm] = useState<McpFormState>(() => defaultMcpFormState());
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSave = () => {
    if (!form.serverName.trim() || !form.url.trim()) {
      Alert.alert('请填写名称与 URL');
      return;
    }
    setBusy(true);
    void createServer(mcpFormToCreateRequest(form, token))
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
    Alert.alert('测试连接', '请先保存服务器，再在详情页测试。');
  };

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-10">
      <McpServerFormFields form={form} onChange={setForm} token={token} onTokenChange={setToken} />
      <Button
        label={busy ? '保存中…' : '保存'}
        disabled={busy}
        onPress={handleSave}
        className="min-h-12 w-full"
        textClassName="font-semibold"
      />
      <Button
        label="测试连接"
        variant="secondary"
        onPress={handleTest}
        className="min-h-12 w-full"
      />
    </ScrollView>
  );
}
