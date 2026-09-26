import { Stack, useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/features/agent/screens/chat-screen';
import type { MobilePreviewState } from '@/features/agent/fixtures/mobile-preview.types';
import { MOBILE_PREVIEW_STATES } from '@/features/agent/fixtures/mobile-preview';

export default function AgentPreviewStateScreen() {
  const { state } = useLocalSearchParams<{ state: string }>();
  const valid = MOBILE_PREVIEW_STATES.some((item) => item.id === state);
  const previewState = (valid ? state : 'empty') as MobilePreviewState;

  return (
    <>
      <Stack.Screen options={{ title: state ?? 'preview' }} />
      <ChatScreen previewState={previewState} />
    </>
  );
}
