import { View } from 'react-native';
import { useAppPreferences } from './app-preferences-provider';

export function ThemeRoot({ children }: { children: React.ReactNode }) {
  const { resolvedColorScheme } = useAppPreferences();
  return (
    <View className={`flex-1 bg-canvas ${resolvedColorScheme === 'dark' ? 'dark' : ''}`}>
      {children}
    </View>
  );
}
