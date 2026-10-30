import { View } from 'react-native';

import { Button } from '@/components/ui/button';

type AppModalActionRowProps = {
  cancelLabel: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  confirmVariant?: 'primary' | 'destructive';
  confirmDisabled?: boolean;
};

/** 浮层底部操作：取消左、确认右（与设置页按钮比例一致）。 */
export function AppModalActionRow({
  cancelLabel,
  onCancel,
  confirmLabel,
  onConfirm,
  confirmVariant = 'primary',
  confirmDisabled = false,
}: AppModalActionRowProps) {
  return (
    <View className="mt-4 flex-row gap-3">
      <Button
        variant="secondary"
        label={cancelLabel}
        onPress={onCancel}
        className="h-10 min-h-10 flex-1 rounded-control"
        textClassName="font-medium"
      />
      <Button
        variant={confirmVariant === 'destructive' ? 'rejection' : 'primary'}
        label={confirmLabel}
        disabled={confirmDisabled}
        onPress={onConfirm}
        className="h-10 min-h-10 flex-1 rounded-control"
        textClassName="font-semibold"
      />
    </View>
  );
}
