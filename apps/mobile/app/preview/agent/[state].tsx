import { Stack, useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/features/agent/screens/chat-screen';
import type { MobilePreviewState } from '@/features/agent/fixtures/mobile-preview.types';
import { MOBILE_PREVIEW_STATES } from '@/features/agent/fixtures/mobile-preview';

export default function AgentPreviewStateScreen() {
  const { state } = useLocalSearchParams<{ state: string }>();
  const entry = MOBILE_PREVIEW_STATES.find((item) => item.id === state);
  const valid = Boolean(entry);
  const previewState = (valid ? state : 'empty') as MobilePreviewState;
  const screenTitle = entry
    ? `${entry.label} · ${entry.id}`
    : state
      ? `页面标识符 ${state}`
      : 'preview';

  return (
    <>
      <Stack.Screen options={{ title: screenTitle }} />
      <ChatScreen previewState={previewState} />
    </>
  );
}
