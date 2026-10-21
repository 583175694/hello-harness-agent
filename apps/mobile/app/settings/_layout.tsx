import { Stack } from 'expo-router';
import { useAppPreferences } from '@/providers/app-preferences-provider';

export default function SettingsLayout() {
  const { resolvedColorScheme } = useAppPreferences();
  const isDark = resolvedColorScheme === 'dark';

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: isDark ? '#101010' : '#f7f7f6' },
        headerTintColor: isDark ? '#d8d8d8' : '#171717',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index" options={{ title: '设置' }} />
      <Stack.Screen name="mcp" options={{ headerShown: false }} />
      <Stack.Screen name="memory" options={{ headerShown: false }} />
    </Stack>
  );
}
