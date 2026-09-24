import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAgentClient, resetAgentClient } from '@/lib/api';
import {
  getApiBaseUrl,
  getContentFontSize,
  getPushNotificationsEnabled,
  getThemePreference,
  setApiBaseUrl,
  setContentFontSize,
  setPushNotificationsEnabled,
  setThemePreference,
} from '@/lib/storage';
import { useAgentSession } from '@/features/agent/context/agent-session-context';
import { registerPushNotifications } from '@/lib/notifications';
import { colors, spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const { reloadService, refreshContentFontSize } = useAgentSession();
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [ready, setReady] = useState<string>('未检测');
  const [pushEnabled, setPushEnabled] = useState(getPushNotificationsEnabled());
  const [fontSize, setFontSize] = useState(getContentFontSize());
  const [theme, setTheme] = useState(getThemePreference());

  useEffect(() => {
    void (async () => {
      try {
        const status = await getAgentClient().getReadiness();
        setReady(status.status);
      } catch {
        setReady('不可用');
      }
    })();
  }, [apiUrl]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>设置</Text>
        <Text style={styles.label}>API Base URL</Text>
        <TextInput
          style={styles.input}
          value={apiUrl}
          onChangeText={setApiUrl}
          placeholder="http://192.168.x.x:4318"
          autoCapitalize="none"
        />
        <Pressable
          style={styles.btn}
          onPress={() => {
            setApiBaseUrl(apiUrl.trim());
            resetAgentClient();
            reloadService();
          }}
        >
          <Text style={styles.btnText}>保存并重新连接</Text>
        </Pressable>
        <Text style={styles.meta}>Readiness: {ready}</Text>
        <Text style={styles.label}>正文字号（12–17）</Text>
        <View style={styles.row}>
          {[12, 13, 14, 15, 16, 17].map((size) => (
            <Pressable
              key={size}
              style={[styles.sizeChip, fontSize === size && styles.sizeChipActive]}
              onPress={() => {
                setFontSize(size);
                setContentFontSize(size);
                refreshContentFontSize();
              }}
            >
              <Text>{size}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>主题</Text>
        <View style={styles.row}>
          {(['system', 'light', 'dark'] as const).map((value) => (
            <Pressable
              key={value}
              style={[styles.sizeChip, theme === value && styles.sizeChipActive]}
              onPress={() => {
                setTheme(value);
                setThemePreference(value);
              }}
            >
              <Text>{value}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Text>Run 完成推送</Text>
          <Switch
            value={pushEnabled}
            onValueChange={(value) => {
              setPushEnabled(value);
              setPushNotificationsEnabled(value);
              if (value) void registerPushNotifications();
            }}
          />
        </View>
        <Link href="/settings/mcp/index" asChild>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkText}>MCP 服务器</Text>
          </Pressable>
        </Link>
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
  label: { color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 15,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  meta: { color: colors.textMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkRow: { paddingVertical: spacing.md },
  linkText: { color: colors.accent, fontSize: 16 },
  secondary: { alignItems: 'center', padding: spacing.lg },
  sizeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 44,
    alignItems: 'center',
  },
  sizeChipActive: { borderColor: colors.accent, backgroundColor: '#eff6ff' },
});
