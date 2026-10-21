import { Switch, View } from 'react-native';
import { Text } from '@/components/ui/text';

type SettingsSwitchProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
};

export function SettingsSwitch({ label, description, value, onValueChange }: SettingsSwitchProps) {
  return (
    <View className="flex-row items-start justify-between gap-3 py-2">
      <View className="min-w-0 flex-1">
        <Text variant="body-sm" className="font-medium text-primary">
          {label}
        </Text>
        {description ? (
          <Text variant="caption" className="mt-1 text-secondary">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}
