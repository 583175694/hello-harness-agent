import { Stack } from 'expo-router';
import { MemoryApiProvider } from '@/features/agent/providers/memory-api-provider';

export default function MemorySettingsLayout() {
  return (
    <MemoryApiProvider>
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
    </MemoryApiProvider>
  );
}
