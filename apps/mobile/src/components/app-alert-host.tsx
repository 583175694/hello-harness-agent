import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppModalActionRow } from '@/components/ui/app-modal-action-row';
import { AppModalShell } from '@/components/ui/app-modal-shell';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import {
  registerAppAlertPresenter,
  type AppAlertButton,
  type AppAlertOptions,
} from '@/lib/app-alert';

export function AppAlertHost() {
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

  const buttons: AppAlertButton[] = useMemo(
    () => (payload?.buttons?.length ? payload.buttons : [{ text: '好的', style: 'default' }]),
    [payload?.buttons],
  );

  const pairedActions = useMemo(() => {
    if (buttons.length !== 2) return null;
    const cancelIndex = buttons.findIndex((b) => b.style === 'cancel');
    if (cancelIndex < 0) return null;
    const confirmIndex = cancelIndex === 0 ? 1 : 0;
    const cancel = buttons[cancelIndex];
    const confirm = buttons[confirmIndex];
    if (!cancel || !confirm) return null;
    return {
      cancel,
      confirm,
      destructive: confirm.style === 'destructive',
    };
  }, [buttons]);

  const runButton = (button: AppAlertButton) => {
    dismiss();
    button.onPress?.();
  };

  return (
    <AppModalShell visible={visible} onDismiss={dismiss}>
      {payload ? (
        <>
          <Text variant="headline" className="mb-2 text-[15px]" fixedSize>
            {payload.title}
          </Text>
          {payload.message ? (
            <Text variant="body-sm" className="leading-relaxed text-secondary" fixedSize>
              {payload.message}
            </Text>
          ) : null}
          {pairedActions ? (
            <AppModalActionRow
              cancelLabel={pairedActions.cancel.text}
              onCancel={() => runButton(pairedActions.cancel)}
              confirmLabel={pairedActions.confirm.text}
              confirmVariant={pairedActions.destructive ? 'destructive' : 'primary'}
              onConfirm={() => runButton(pairedActions.confirm)}
            />
          ) : buttons.length === 1 ? (
            <Button
              label={buttons[0]?.text ?? '好的'}
              onPress={() => runButton(buttons[0]!)}
              className="mt-4 h-10 min-h-10 w-full rounded-control"
              textClassName="font-semibold"
            />
          ) : (
            <View className="mt-4 gap-2">
              {buttons.map((button, index) => (
                <Pressable
                  key={`${button.text}-${index}`}
                  onPress={() => runButton(button)}
                  className={cn(
                    'min-h-10 items-center justify-center rounded-control active:bg-subtle',
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
          )}
        </>
      ) : null}
    </AppModalShell>
  );
}
