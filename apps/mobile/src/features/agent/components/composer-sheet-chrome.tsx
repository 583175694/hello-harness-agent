import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { COMPOSER_SHEET_CARD_SHADOW } from '@/lib/theme';

export function ComposerSheetGrabHandle() {
  return (
    <View className="items-center pb-1 pt-2.5">
      <View className="h-1 w-9 rounded-full bg-border/80" />
    </View>
  );
}

/** iOS 式浮卡：白底 + 轻 shadow，与 scrim 分离 */
export function ComposerSheetFloatingCard({ children }: { children: ReactNode }) {
  return (
    <View
      className="overflow-hidden rounded-[14px] bg-surface"
      style={COMPOSER_SHEET_CARD_SHADOW}
    >
      {children}
    </View>
  );
}

type ComposerSheetActionRowProps = {
  label: string;
  hint: string;
  icon: LucideIcon;
  onPress: () => void;
  showDivider?: boolean;
};

export function ComposerSheetActionRow({
  label,
  hint,
  icon,
  onPress,
  showDivider = false,
}: ComposerSheetActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center gap-3.5 px-4 active:bg-subtle ${
        showDivider ? 'border-b border-composer-border' : ''
      }`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Icon icon={icon} tone="secondary" size={20} textWeight="regular" />
      <Text variant="body" className="font-normal text-primary">
        {label}
      </Text>
    </Pressable>
  );
}

export function ComposerSheetCancelRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="min-h-[52px] items-center justify-center active:bg-subtle"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text variant="body" className="font-semibold text-primary">
        {label}
      </Text>
    </Pressable>
  );
}

/** 全高 Sheet 顶栏：标题 + 右侧文字动作 */
export function ComposerSheetHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 pb-2 pt-0.5">
      <Text variant="body" className="font-semibold text-primary">
        {title}
      </Text>
      <Pressable
        onPress={onAction}
        hitSlop={10}
        className="-mr-1 min-h-10 justify-center px-1 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <Text variant="body-sm" className="font-semibold text-link">
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}
