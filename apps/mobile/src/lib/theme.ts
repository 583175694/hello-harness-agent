/**
 * Design tokens shared outside Tailwind (icons, Reanimated pressables).
 * Settings panel fields are independent surfaces inside rounded-panel cards —
 * do not concentric-match inner control radius to panel radius.
 */
export const colors = {
  canvas: '#f7f7f6',
  drawer: '#fbfaf9',
  surface: '#ffffff',
  subtle: '#f1f1ef',
  composerBorder: '#ededeb',
  userBubble: '#edf3fe',
  userBubbleBorder: '#dbe6f8',
  primary: '#171717',
  primaryForeground: '#ffffff',
  secondary: '#555551',
  muted: '#898986',
  link: '#3f5f78',
  approval: '#2f5d3a',
  approvalBright: '#4f8a64',
  rejection: '#984b41',
  border: '#dededb',
  terminalAccent: '#fbbf24',
  warning: '#d97706',
  destructive: '#b91c1c',
  /** Icons on terminal / dark chrome (e.g. diff header actions). */
  onTerminal: '#9ca3af',
  /** @deprecated Use `onTerminal` */
  zincMuted: '#9ca3af',
  /** Disclosure chevrons (expand rows, reasoning, tool groups). */
  chevronIdle: '#c4c7c7',
  overlayInverse: 'rgba(255,255,255,0.85)',
  /** Full-screen scrim behind Drawer / attachment Modal; matches Workbench backdrop strength. */
  overlayScrim: 'rgba(0,0,0,0.4)',
} as const;

/** Gorhom BottomSheetBackdrop `opacity` prop — keep in sync with `colors.overlayScrim`. */
export const OVERLAY_SCRIM_OPACITY = 0.4;

export const iconColors = {
  primary: colors.primary,
  secondary: colors.secondary,
  muted: colors.muted,
  inverse: colors.primaryForeground,
  link: colors.link,
  approval: colors.approval,
  approvalBright: colors.approvalBright,
  rejection: colors.rejection,
  warning: colors.warning,
  onPrimary: colors.primaryForeground,
  destructive: colors.destructive,
  terminalAccent: colors.terminalAccent,
  onTerminal: colors.onTerminal,
  zincMuted: colors.zincMuted,
  chevronIdle: colors.chevronIdle,
  overlayInverse: colors.overlayInverse,
} as const;

export type IconTone = keyof typeof iconColors;

/** Adjacent label weight — drives stroke per better-ui icons.md. */
export type IconTextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

/**
 * Lucide stroke width (render px) from icon size + adjacent text weight.
 * Override per call with `<Icon strokeWidth={2} />` when needed.
 */
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

/**
 * Chevron / trailing icon tones (better-ui: one convention per semantic).
 * - disclosure: in-row expand/collapse (reasoning, tool group, source card)
 * - push: navigate forward (settings rows, drill-in lists)
 */
export const ICON_CHEVRON_TONE = {
  disclosure: 'chevronIdle',
  push: 'muted',
} as const satisfies Record<string, IconTone>;
