import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

type BadgeProps = {
  label: string;
  tone?: 'default' | 'success' | 'dark' | 'muted';
  className?: string;
};

const toneClass: Record<NonNullable<BadgeProps['tone']>, string> = {
  default: 'bg-subtle text-secondary',
  success: 'bg-approval text-approval-text',
  dark: 'bg-primary text-primary-foreground',
  muted: 'bg-[#e3e3e0] text-secondary',
};

export function Badge({ label, tone = 'default', className }: BadgeProps) {
  return (
    <View className={cn('rounded-full px-1.5 py-0.5', toneClass[tone], className)}>
      <Text variant="caption" className="text-inherit font-medium">
        {label}
      </Text>
    </View>
  );
}
