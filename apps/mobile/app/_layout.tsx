import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AgentSessionProvider, useAgentSession } from '@/features/agent/context/agent-session-context';

const queryClient = new QueryClient();

function DeepLinkListener() {
  const { selectSessionFromDeepLink } = useAgentSession();
  useEffect(() => {
    const handle = (url: string) => {
      const parsed = Linking.parse(url);
      const sessionId = parsed.queryParams?.session;
      if (typeof sessionId === 'string' && sessionId) selectSessionFromDeepLink(sessionId);
    };
    void Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    const sub = Linking.addEventListener('url', (event) => handle(event.url));
    return () => sub.remove();
  }, [selectSessionFromDeepLink]);
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AgentSessionProvider>
            <DeepLinkListener />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="settings/index" options={{ presentation: 'modal' }} />
              <Stack.Screen name="settings/mcp/index" />
              <Stack.Screen name="settings/mcp/[id]" />
              <Stack.Screen name="preview/[artifactId]" />
            </Stack>
          </AgentSessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
