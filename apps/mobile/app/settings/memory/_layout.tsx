import { Stack } from 'expo-router';
import { MemoryLocalProvider } from '@/features/agent/providers/memory-local-provider';

export default function MemorySettingsLayout() {
  return (
    <MemoryLocalProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: '#171717',
          headerShadowVisible: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="index" options={{ title: '记忆' }} />
        <Stack.Screen name="list" options={{ title: '记忆条目' }} />
        <Stack.Screen name="form" options={{ title: '编辑记忆' }} />
      </Stack>
    </MemoryLocalProvider>
  );
}
