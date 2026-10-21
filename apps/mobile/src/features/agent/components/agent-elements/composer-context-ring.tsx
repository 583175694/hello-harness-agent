import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';

type ComposerContextRingProps = {
  usedTokens: number;
  budgetTokens: number;
  compactionTriggered?: boolean;
};

export function ComposerContextRing({
  usedTokens,
  budgetTokens,
  compactionTriggered,
}: ComposerContextRingProps) {
  const [open, setOpen] = useState(false);
  const percentage = budgetTokens > 0 ? Math.min(100, (usedTokens / budgetTokens) * 100) : 0;
  const strokeDashoffset = 100 - percentage;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="h-9 w-9 items-center justify-center active:opacity-80"
        accessibilityLabel={`上下文已使用 ${percentage.toFixed(0)}%`}
      >
        <View className="absolute">
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={9} stroke="#dededb" strokeWidth={2} fill="none" />
            <Circle
              cx={12}
              cy={12}
              r={9}
              stroke="#171717"
              strokeWidth={2}
              fill="none"
              strokeDasharray="100"
              strokeDashoffset={strokeDashoffset}
              rotation={-90}
              origin="12, 12"
            />
          </Svg>
        </View>
        <Text variant="caption" className="text-[10px] font-medium text-primary">
          {percentage.toFixed(0)}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-overlay-scrim" onPress={() => setOpen(false)} />
        <View className="absolute bottom-24 left-4 right-4 rounded-panel border border-border bg-surface p-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text variant="body-sm" className="font-semibold">
              上下文使用量
            </Text>
            <Text variant="body-sm">{percentage.toFixed(1)}%</Text>
          </View>
          <View className="mb-3 h-1.5 overflow-hidden rounded-full bg-subtle">
            <View className="h-full bg-primary" style={{ width: `${percentage}%` }} />
          </View>
          <Text variant="caption" className="text-secondary">
            已使用 {usedTokens.toLocaleString()} / 预算 {budgetTokens.toLocaleString()} tokens
          </Text>
          {compactionTriggered ? (
            <Text variant="caption" className="mt-2 text-muted">
              本轮已执行上下文压缩
            </Text>
          ) : null}
        </View>
      </Modal>
    </>
  );
}
