import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAgentClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { colors, spacing } from '@/theme/tokens';

export default function PreviewScreen() {
  const { artifactId } = useLocalSearchParams<{ artifactId: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const preview = await getAgentClient().getArtifactPreview(artifactId);
        setHtml(`<pre style="white-space: pre-wrap; font-family: -apple-system; padding: 16px;">${preview.content}</pre>`);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      }
    })();
  }, [artifactId]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>关闭</Text>
        </Pressable>
        <Text style={styles.title}>预览</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!html && !error ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
      {html ? <WebView originWhitelist={['*']} source={{ html }} style={styles.webview} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent },
  title: { fontWeight: '600', fontSize: 17 },
  error: { color: colors.danger, padding: spacing.lg },
  webview: { flex: 1 },
});
