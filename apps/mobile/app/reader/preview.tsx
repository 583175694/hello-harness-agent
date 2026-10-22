import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Text } from '@/components/ui/text';
import { useAgentHost } from '@/features/agent/hooks/use-agent-host';
import { loadArtifactPreviewText } from '@/lib/artifact-actions';

export default function FilePreviewScreen() {
  const { name, kind, artifactId } = useLocalSearchParams<{
    name?: string;
    kind?: string;
    artifactId?: string;
  }>();
  const host = useAgentHost();
  const fileName = name ?? '文件预览';
  const fileKind = kind ?? 'text';

  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(artifactId));

  useEffect(() => {
    if (!artifactId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadArtifactPreviewText(host.client, artifactId, controller.signal)
      .then((preview) => {
        setContent(preview.content);
      })
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : '预览加载失败');
      })
      .finally(() => {
        setLoading(false);
      });
    return () => controller.abort();
  }, [artifactId, host.client]);

  const staticFixture =
    '--- a/tests/test_auth_2fa.py\n+++ b/tests/test_auth_2fa.py\n@@ -12,6 +12,10 @@\n+def test_totp_verification_success():\n+    assert verify_totp("123456") is True';

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-3 p-4">
      <Text variant="headline">{fileName}</Text>
      <Text variant="caption" className="text-muted">
        {fileKind}
        {artifactId ? ' · API 预览' : ' · 静态预览'}
      </Text>
      {loading ? (
        <View className="items-center py-8">
          <ActivityIndicator />
        </View>
      ) : null}
      {error ? (
        <Text variant="body-sm" className="text-destructive">
          {error}
        </Text>
      ) : null}
      <View className="rounded-panel border border-border bg-terminal p-3">
        {fileKind === 'markdown' && content ? (
          <Markdown>{content}</Markdown>
        ) : (
          <Text variant="mono" className="text-zinc-300">
            {artifactId ? (content ?? '') : staticFixture}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
