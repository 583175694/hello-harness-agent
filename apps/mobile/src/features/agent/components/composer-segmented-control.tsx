import { Pressable, View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { AGENT_UI_BUTTON } from '../config/ui.constants';

export type ComposerSegmentOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type ComposerSegmentedControlProps<T extends string> = {
  options: ComposerSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

const { classNames: btn } = AGENT_UI_BUTTON;

/**
 * Composer 内分段选择（推理强度等）：与 Workbench Tab 相同 — 瞬时背景切换，无滑块动画。
 */
export function ComposerSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: ComposerSegmentedControlProps<T>) {
  return (
    <View className={cn(btn.segmentTrack, 'min-h-[36px]')} accessibilityRole="radiogroup">
      {options.map((opt) => {
        const selected = opt.value === value;
        const disabled = opt.disabled ?? false;
        return (
          <Pressable
            key={opt.value}
            disabled={disabled}
            onPress={() => onChange(opt.value)}
            className={cn(btn.segmentTab, 'min-h-[34px] flex-1 px-1', selected && btn.segmentTabSelected)}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={opt.label}
          >
            <Text
              variant="caption"
              className={cn(
                'font-semibold',
                selected && !disabled
                  ? btn.segmentLabelSelected
                  : disabled
                    ? 'text-muted opacity-50'
                    : btn.segmentLabelIdle,
              )}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
