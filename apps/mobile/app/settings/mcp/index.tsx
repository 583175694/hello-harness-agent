import { Link, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAgentClient } from '@/lib/api';
import { colors, spacing } from '@/theme/tokens';

export default function McpListScreen() {
  const client = getAgentClient();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: () => client.listMcpServers(),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>MCP 服务器</Text>
        {isLoading ? <ActivityIndicator /> : null}
        {data?.servers.map((server) => (
          <Link key={server.id} href={`/settings/mcp/${server.id}`} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardTitle}>{server.serverName}</Text>
              <Text style={styles.meta}>
                {server.status} · {server.toolCountExposed} tools
              </Text>
            </Pressable>
          </Link>
        ))}
        <Pressable
          style={styles.btn}
          onPress={() => router.push('/settings/mcp/new' as never)}
        >
          <Text style={styles.btnText}>添加服务器</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => void refetch()}>
          <Text>刷新</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.back()}>
          <Text>返回</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontWeight: '600', fontSize: 16 },
  meta: { color: colors.textMuted, marginTop: 4 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  secondary: { alignItems: 'center', padding: spacing.md },
});
