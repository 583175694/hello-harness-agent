import { Stack } from 'expo-router';

export default function PreviewLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f7f7f6' } }} />
  );
}
