import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { MobileLoginForm } from '@/features/auth/mobile-login-form';
import { useMobileAuth } from '@/providers/mobile-auth-provider';

export default function SettingsLoginScreen() {
  const router = useRouter();
  const { setAuthUser } = useMobileAuth();

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
      <View className="rounded-panel border border-border bg-surface p-4">
        <MobileLoginForm
          onLoggedIn={(user) => {
            setAuthUser(user);
            router.back();
          }}
        />
      </View>
    </ScrollView>
  );
}
