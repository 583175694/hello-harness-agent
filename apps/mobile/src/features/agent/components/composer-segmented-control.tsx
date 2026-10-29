import { Pressable, View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { AGENT_UI_BUTTON } from '../config/ui.constants';
import { SlidingSegmentTrack } from './sliding-segmented-control';

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

export function ComposerSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: ComposerSegmentedControlProps<T>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );

  return (
    <SlidingSegmentTrack
      segmentCount={options.length}
      selectedIndex={selectedIndex}
      minTrackHeight={36}
    >
      <View className="min-h-[36px] flex-row" accessibilityRole="radiogroup">
        {options.map((opt) => {
          const selected = opt.value === value;
          const disabled = opt.disabled ?? false;
          return (
            <Pressable
              key={opt.value}
              disabled={disabled}
              onPress={() => onChange(opt.value)}
              className={cn(btn.segmentTab, 'min-h-[34px] flex-1 px-1')}
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
    </SlidingSegmentTrack>
  );
}
