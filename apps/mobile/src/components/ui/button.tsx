import { Pressable, type PressableProps } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

type ButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'rejection';
  size?: 'sm' | 'md' | 'icon';
  textClassName?: string;
};

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary active:bg-[#2c2c2a]',
  secondary: 'bg-subtle border border-border active:bg-[#e8e8e5]',
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
    <Pressable
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
      {size === 'icon' ? null : (
        <Text variant="body-sm" className={cn(textVariantClass[variant], textClassName)}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
