import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '@/lib/cn';

type TextProps = RNTextProps & {
  variant?: 'body' | 'body-sm' | 'caption' | 'headline' | 'mono';
};

const variantClass: Record<NonNullable<TextProps['variant']>, string> = {
  body: 'text-[14px] leading-[22px] text-primary',
  'body-sm': 'text-[13px] leading-5 text-secondary',
  caption: 'text-[12px] leading-4 text-muted',
  headline: 'text-[16px] leading-6 font-semibold text-primary',
  mono: 'text-[12px] leading-[18px] font-mono text-primary',
};

export function Text({ variant = 'body', className, ...props }: TextProps) {
  return <RNText className={cn(variantClass[variant], className)} {...props} />;
}
