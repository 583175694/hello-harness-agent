import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { registerAppToastPresenter } from '@/lib/app-toast';
import { AGENT_UI_BEHAVIOR } from '@/features/agent/config/ui.constants';

const TOAST_VISIBLE_MS = 2_200;

export function AppToastHost() {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const present = useCallback((text: string) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    setMessage(text);
    hideTimerRef.current = setTimeout(() => {
      setMessage(null);
      hideTimerRef.current = null;
    }, TOAST_VISIBLE_MS);
  }, []);

  useEffect(() => {
    registerAppToastPresenter(present);
    return () => {
      registerAppToastPresenter(null);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [present]);

  if (!message) return null;

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 bottom-0 items-center px-4"
      style={{ paddingBottom: Math.max(insets.bottom, 16) + 72 }}
    >
      <Animated.View
        entering={FadeInDown.duration(AGENT_UI_BEHAVIOR.copyFeedbackDurationMs)}
        exiting={FadeOutDown.duration(200)}
        className="rounded-full bg-primary px-4 py-2.5"
      >
        <Text variant="body-sm" className="font-medium text-primary-foreground">
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}
