import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import {
  registerAppAlertPresenter,
  type AppAlertButton,
  type AppAlertOptions,
} from '@/lib/app-alert';
import { useThemeColors } from '@/lib/use-theme-colors';

export function AppAlertHost() {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const [visible, setVisible] = useState(false);
  const [payload, setPayload] = useState<AppAlertOptions | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    setPayload(null);
  }, []);

  const present = useCallback((options: AppAlertOptions) => {
    setPayload(options);
    setVisible(true);
  }, []);

  useEffect(() => {
    registerAppAlertPresenter(present);
    return () => registerAppAlertPresenter(null);
  }, [present]);

  const buttons: AppAlertButton[] =
    payload?.buttons?.length ? payload.buttons : [{ text: '好的', style: 'default' }];

  const runButton = (button: AppAlertButton) => {
    dismiss();
    button.onPress?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable
        className="flex-1 justify-center px-6"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: themeColors.overlayScrim,
        }}
        onPress={dismiss}
      >
        <Pressable
          className="overflow-hidden rounded-sheet border border-composer-border bg-surface"
          onPress={(event) => event.stopPropagation()}
        >
          {payload ? (
            <View className="gap-3 px-4 py-4">
              <Text variant="body" className="font-semibold text-primary">
                {payload.title}
              </Text>
              {payload.message ? (
                <Text variant="body-sm" className="leading-relaxed text-secondary">
                  {payload.message}
                </Text>
              ) : null}
              <View className="mt-1 gap-2">
                {buttons.map((button, index) => (
                  <Pressable
                    key={`${button.text}-${index}`}
                    onPress={() => runButton(button)}
                    className={cn(
                      'min-h-11 items-center justify-center rounded-control active:bg-subtle',
                      button.style === 'destructive' && 'bg-destructive/10',
                    )}
                    accessibilityRole="button"
                  >
                    <Text
                      variant="body-sm"
                      className={cn(
                        'font-semibold',
                        button.style === 'destructive'
                          ? 'text-destructive'
                          : button.style === 'cancel'
                            ? 'text-muted'
                            : 'text-primary',
                      )}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
