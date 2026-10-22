/**
 * Mobile 设计 token 语义表（与 Web `theme.css` 的 `--theme-*` 同名对齐，仅维护在本 app）。
 * `global.css` 的 RGB 通道须与本文件 hex 一致；`theme.ts` 只从此表派生。
 */
export type ColorScheme = 'light' | 'dark';

/** 与 Web `--theme-*` / 产品语义一一对应，bg/text 分离。 */
export type DesignTokens = {
  canvas: string;
  drawer: string;
  surface: string;
  subtle: string;
  surfaceHover: string;
  composerBorder: string;
  composerPlaceholder: string;
  userBubble: string;
  userBubbleBorder: string;
  primary: string;
  primaryPressed: string;
  primaryForeground: string;
  subtlePressed: string;
  secondary: string;
  muted: string;
  link: string;
  border: string;
  approvalBg: string;
  approvalText: string;
  rejectionBg: string;
  rejectionText: string;
  rejectionBorder: string;
  rejectionBorderPressed: string;
  warning: string;
  danger: string;
  terminalBg: string;
  terminalHeaderBg: string;
  terminalFg: string;
  terminalMuted: string;
  terminalAccent: string;
  onTerminal: string;
  chevronIdle: string;
  overlayInverse: string;
  overlayScrim: string;
};

/** 浅色 — 对齐 Web `:root` / `--theme-*` */
export const designTokensLight: DesignTokens = {
  canvas: '#f7f7f6',
  drawer: '#fbfaf9',
  surface: '#ffffff',
  subtle: '#f1f1ef',
  surfaceHover: '#e9e9e6',
  composerBorder: '#ededeb',
  composerPlaceholder: '#a0a09c',
  userBubble: '#edf3fe',
  userBubbleBorder: '#dbe6f8',
  primary: '#171717',
  primaryPressed: '#2c2c2a',
  primaryForeground: '#ffffff',
  subtlePressed: '#e8e8e5',
  secondary: '#555551',
  muted: '#898986',
  link: '#3f5f78',
  border: '#dededb',
  approvalBg: '#eaf2ec',
  approvalText: '#2f5d3a',
  rejectionBg: '#f8ecea',
  rejectionText: '#984b41',
  rejectionBorder: '#f3d3cf',
  rejectionBorderPressed: '#f3dedb',
  warning: '#8b6a3e',
  danger: '#984b41',
  terminalBg: '#ffffff',
  terminalHeaderBg: '#f6f6f5',
  terminalFg: '#171717',
  terminalMuted: '#555551',
  terminalAccent: '#34c759',
  onTerminal: '#898986',
  chevronIdle: '#c4c7c7',
  overlayInverse: 'rgba(255,255,255,0.85)',
  overlayScrim: 'rgba(0,0,0,0.4)',
};

/** 深色 — 对齐 Web `:root[data-theme='dark']` */
export const designTokensDark: DesignTokens = {
  canvas: '#101010',
  drawer: '#141414',
  surface: '#181818',
  subtle: '#202020',
  surfaceHover: '#252525',
  composerBorder: '#383838',
  composerPlaceholder: '#8a8a8a',
  userBubble: '#202020',
  userBubbleBorder: '#303030',
  primary: '#d8d8d8',
  primaryPressed: '#c8c8c8',
  primaryForeground: '#101010',
  subtlePressed: '#282828',
  secondary: '#b4b4b0',
  muted: '#82827e',
  link: '#8fb5cf',
  border: '#2b2b2b',
  approvalBg: '#1d2a20',
  approvalText: '#a9c5ae',
  rejectionBg: '#2d201f',
  rejectionText: '#d8aaa3',
  rejectionBorder: '#3d302e',
  rejectionBorderPressed: '#4a3835',
  warning: '#c9a06b',
  danger: '#e28d85',
  terminalBg: '#0f1115',
  terminalHeaderBg: '#0f1115',
  terminalFg: '#e8eaed',
  terminalMuted: '#9499a0',
  terminalAccent: '#4ade80',
  onTerminal: '#9499a0',
  chevronIdle: '#5a5a58',
  overlayInverse: 'rgba(16,16,16,0.85)',
  overlayScrim: 'rgba(0,0,0,0.4)',
};

export function resolveDesignTokens(scheme: ColorScheme): DesignTokens {
  return scheme === 'dark' ? designTokensDark : designTokensLight;
}
