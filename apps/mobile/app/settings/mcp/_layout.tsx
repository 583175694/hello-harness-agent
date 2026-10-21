import { Stack } from 'expo-router';

export default function McpSettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: 'transparent' },
        headerTintColor: '#171717',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'MCP 服务器' }} />
      <Stack.Screen name="new" options={{ title: '添加 MCP' }} />
      <Stack.Screen name="[id]" options={{ title: '编辑 MCP' }} />
    </Stack>
  );
}
