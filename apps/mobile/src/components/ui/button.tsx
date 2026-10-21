import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { cn } from '@/lib/cn';
import { PressableScale } from '@/components/ui/pressable-scale';
import type { ComponentProps } from 'react';
import { Text } from './text';

type ButtonProps = Omit<ComponentProps<typeof PressableScale>, 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Omit when `size="icon"` and passing `children`. */
  label?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'rejection';
  size?: 'sm' | 'md' | 'icon';
  textClassName?: string;
};

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary active:bg-primary-pressed',
  secondary: 'bg-subtle border border-border active:bg-subtle-pressed',
  ghost: 'bg-transparent active:bg-subtle',
  rejection: 'bg-rejection border border-[#f3d3cf] active:bg-[#f3dedb]',
};

const textVariantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'text-primary-foreground font-medium',
  secondary: 'text-primary font-medium',
  ghost: 'text-secondary',
  rejection: 'text-rejection-text font-medium',
};

export function Button({
  label,
  children,
  variant = 'primary',
  size = 'md',
  className,
  textClassName,
  disabled,
  ...props
}: ButtonProps) {
  const sizeClass =
    size === 'icon'
      ? 'h-8 w-8 items-center justify-center rounded-full'
      : size === 'sm'
        ? 'h-8 px-3 rounded-control items-center justify-center'
        : 'h-10 px-4 rounded-control items-center justify-center';

  return (
    <PressableScale
      accessibilityRole="button"
      disabled={disabled}
      className={cn(
        sizeClass,
        variantClass[variant],
        disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      {children ??
        (label ? (
          <Text variant="body-sm" className={cn(textVariantClass[variant], textClassName)}>
            {label}
          </Text>
        ) : null)}
    </PressableScale>
  );
}
