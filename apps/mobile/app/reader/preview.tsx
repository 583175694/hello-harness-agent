import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';

export default function FilePreviewScreen() {
  const { name, kind } = useLocalSearchParams<{ name?: string; kind?: string }>();
  const fileName = name ?? 'test_auth_2fa.py';
  const fileKind = kind ?? 'text';

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-3 p-4">
      <Text variant="headline">{fileName}</Text>
      <Text variant="caption" className="text-muted">
        {fileKind} · 静态预览
      </Text>
      <View className="rounded-panel border border-border bg-terminal p-3">
        <Text variant="mono" className="text-zinc-300">
          {`--- a/tests/test_auth_2fa.py\n+++ b/tests/test_auth_2fa.py\n@@ -12,6 +12,10 @@\n+def test_totp_verification_success():\n+    assert verify_totp("123456") is True`}
        </Text>
      </View>
    </ScrollView>
  );
}
