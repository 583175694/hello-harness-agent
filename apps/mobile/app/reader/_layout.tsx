import { Stack } from 'expo-router';

export default function ReaderLayout() {
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
      <Stack.Screen name="report" options={{ title: '报告' }} />
      <Stack.Screen name="preview" options={{ title: '预览' }} />
    </Stack>
  );
}
