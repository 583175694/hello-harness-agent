import { View } from 'react-native';
import { AppAlertHost } from '@/components/app-alert-host';
import { AppToastHost } from '@/components/app-toast-host';
import { useAppPreferences } from './app-preferences-provider';

export function ThemeRoot({ children }: { children: React.ReactNode }) {
  const { resolvedColorScheme } = useAppPreferences();
  return (
    <View className={`flex-1 bg-canvas ${resolvedColorScheme === 'dark' ? 'dark' : ''}`}>
      {children}
      <AppAlertHost />
      <AppToastHost />
    </View>
  );
}
