import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#f7f7f6' },
        headerTintColor: '#171717',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#f7f7f6' },
      }}
    >
      <Stack.Screen name="index" options={{ title: '设置' }} />
      <Stack.Screen name="mcp" options={{ title: 'MCP 服务器' }} />
    </Stack>
  );
}
