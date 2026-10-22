/**
 * 运行时主题 API：`Icon`、StyleSheet、阴影等。颜色语义来自 `design-tokens.ts`。
 */
import {
  designTokensLight,
  resolveDesignTokens,
  type ColorScheme,
  type DesignTokens,
} from '@/lib/design-tokens';

export type { ColorScheme, DesignTokens };
export { designTokensLight, designTokensDark, resolveDesignTokens } from '@/lib/design-tokens';

/** @deprecated Use `resolveDesignTokens` / `useThemeColors`. */
export const colors = designTokensLight;

export type ThemeColors = DesignTokens;

export function resolveColors(scheme: ColorScheme): DesignTokens {
  return resolveDesignTokens(scheme);
}

/** Gorhom BottomSheetBackdrop `opacity` prop — keep in sync with `overlayScrim`. */
export const OVERLAY_SCRIM_OPACITY = 0.4;

export type IconTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'link'
  | 'approval'
  | 'approvalBright'
  | 'rejection'
  | 'warning'
  | 'onPrimary'
  | 'destructive'
  | 'terminalAccent'
  | 'onTerminal'
  | 'zincMuted'
  | 'chevronIdle'
  | 'overlayInverse';

function iconPalette(tokens: DesignTokens): Record<IconTone, string> {
  return {
    primary: tokens.primary,
    secondary: tokens.secondary,
    muted: tokens.muted,
    inverse: tokens.primaryForeground,
    link: tokens.link,
    approval: tokens.approvalText,
    approvalBright: tokens.terminalAccent,
    rejection: tokens.rejectionText,
    warning: tokens.warning,
    onPrimary: tokens.primaryForeground,
    destructive: tokens.danger,
    terminalAccent: tokens.terminalAccent,
    onTerminal: tokens.onTerminal,
    zincMuted: tokens.onTerminal,
    chevronIdle: tokens.chevronIdle,
    overlayInverse: tokens.overlayInverse,
  };
}

/** @deprecated Prefer `resolveIconColors(scheme)`. */
export const iconColors = iconPalette(designTokensLight);

export function resolveIconColors(scheme: ColorScheme): Record<IconTone, string> {
  return iconPalette(resolveDesignTokens(scheme));
}

/** Adjacent label weight — drives stroke per better-ui icons.md. */
export type IconTextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export function iconStrokeWidth(size: number, weight: IconTextWeight = 'regular'): number {
  if (weight === 'bold') {
    return 2.5;
  }
  if (weight === 'medium' || weight === 'semibold') {
    if (size <= 14) return 2;
    if (size <= 18) return 2;
    return 2.5;
  }
  if (size <= 14) return 1.5;
  if (size <= 18) return 2;
  return 2.5;
}

export const ICON_CHEVRON_TONE = {
  disclosure: 'chevronIdle',
  push: 'muted',
} as const satisfies Record<string, IconTone>;

