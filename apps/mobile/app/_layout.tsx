import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AgentHostProvider } from '@/features/agent/providers/agent-host-provider';
import { AppPreferencesProvider, useAppPreferences } from '@/providers/app-preferences-provider';
import { MobileAuthProvider } from '@/providers/mobile-auth-provider';
import { ThemeRoot } from '@/providers/theme-root';

function RootNavigation() {
  const { resolvedColorScheme } = useAppPreferences();
  const isDark = resolvedColorScheme === 'dark';

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="preview" />
        <Stack.Screen name="reader" />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppPreferencesProvider>
          <MobileAuthProvider>
            <AgentHostProvider>
              <ThemeRoot>
                <RootNavigation />
              </ThemeRoot>
            </AgentHostProvider>
          </MobileAuthProvider>
        </AppPreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
