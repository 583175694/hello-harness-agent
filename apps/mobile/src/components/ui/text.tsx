import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '@/lib/cn';
import { useAppPreferences } from '@/providers/app-preferences-provider';

type TextProps = RNTextProps & {
  variant?: 'body' | 'body-sm' | 'caption' | 'headline' | 'mono';
  /** 忽略用户正文字号偏好（设置页标签等） */
  fixedSize?: boolean;
};

const variantClass: Record<NonNullable<TextProps['variant']>, string> = {
  body: 'leading-[22px] text-primary',
  'body-sm': 'leading-5 text-secondary',
  caption: 'leading-4 text-muted',
  headline: 'leading-6 font-semibold text-primary',
  mono: 'leading-[18px] font-mono text-primary',
};

const variantBaseSize: Record<NonNullable<TextProps['variant']>, number> = {
  body: 14,
  'body-sm': 13,
  caption: 12,
  headline: 16,
  mono: 12,
};

export function Text({ variant = 'body', className, fixedSize = false, style, ...props }: TextProps) {
  const { preferences } = useAppPreferences();
  const base = variantBaseSize[variant];
  const userSize =
    !fixedSize && (variant === 'body' || variant === 'body-sm')
      ? preferences.contentFontSize
      : base;
  const scale = userSize / base;
  const lineHeight =
    variant === 'body'
      ? Math.round(22 * scale)
      : variant === 'body-sm'
        ? Math.round(20 * scale)
        : undefined;

  return (
    <RNText
      className={cn(variantClass[variant], className)}
      style={[{ fontSize: userSize }, lineHeight ? { lineHeight } : null, style]}
      {...props}
    />
  );
}
