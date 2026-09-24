import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAgentClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { colors, spacing } from '@/theme/tokens';

export default function McpFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const client = getAgentClient();
  const [loading, setLoading] = useState(!isNew);
  const [serverName, setServerName] = useState('');
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [required, setRequired] = useState(false);
  const [defaultApproval, setDefaultApproval] = useState<'auto_execute' | 'require_approval'>(
    'require_approval',
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    void (async () => {
      try {
        const list = await client.listMcpServers();
        const server = list.servers.find((item) => item.id === id);
        if (!server) throw new Error('未找到 MCP 服务器');
        setServerName(server.serverName);
        setUrl(server.url);
        setEnabled(server.enabled);
        setRequired(server.required);
        setDefaultApproval(server.defaultApproval);
      } catch (error) {
        setMessage(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [client, id, isNew]);

  async function save() {
    setMessage(null);
    try {
      if (isNew) {
        await client.createMcpServer({
          serverName,
          url,
          enabled,
          required,
          defaultApproval,
          headersPlain: {},
          startupTimeoutMs: 30_000,
          toolCallTimeoutMs: 60_000,
          failOnStartupError: false,
          maxInstructionBytes: 32_768,
          reconnectEnabled: true,
          reconnectMaxAttempts: 5,
        });
      } else {
        await client.updateMcpServer(id!, {
          serverName,
          url,
          enabled,
          required,
          defaultApproval,
          headersPlain: {},
          startupTimeoutMs: 30_000,
          toolCallTimeoutMs: 60_000,
          failOnStartupError: false,
          maxInstructionBytes: 32_768,
          reconnectEnabled: true,
          reconnectMaxAttempts: 5,
        });
      }
      router.back();
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }

  async function testServer() {
    if (isNew) return;
    setMessage(null);
    try {
      const result = await client.testMcpServer(id!);
      setMessage(result.ok ? `OK · ${result.toolNames.length} tools` : result.error ?? 'Test failed');
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }

  async function remove() {
    if (isNew) return;
    await client.deleteMcpServer(id!);
    router.back();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? '添加 MCP' : '编辑 MCP'}</Text>
        <TextInput style={styles.input} value={serverName} onChangeText={setServerName} placeholder="serverName" />
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://..."
          autoCapitalize="none"
        />
        <View style={styles.row}>
          <Text>启用</Text>
          <Switch value={enabled} onValueChange={setEnabled} />
        </View>
        <View style={styles.row}>
          <Text>必需</Text>
          <Switch value={required} onValueChange={setRequired} />
        </View>
        <View style={styles.row}>
          <Text>默认审批</Text>
          <Pressable
            onPress={() =>
              setDefaultApproval((v) => (v === 'require_approval' ? 'auto_execute' : 'require_approval'))
            }
          >
            <Text style={styles.link}>{defaultApproval}</Text>
          </Pressable>
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable style={styles.btn} onPress={() => void save()}>
          <Text style={styles.btnText}>保存</Text>
        </Pressable>
        {!isNew ? (
          <Pressable style={styles.secondary} onPress={() => void testServer()}>
            <Text>测试连接</Text>
          </Pressable>
        ) : null}
        {!isNew ? (
          <Pressable style={styles.danger} onPress={() => void remove()}>
            <Text style={styles.dangerText}>删除</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.secondary} onPress={() => router.back()}>
          <Text>返回</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 15,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.accent },
  message: { color: colors.textSecondary },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  secondary: { alignItems: 'center', padding: spacing.md },
  danger: { alignItems: 'center', padding: spacing.md },
  dangerText: { color: colors.danger },
});
