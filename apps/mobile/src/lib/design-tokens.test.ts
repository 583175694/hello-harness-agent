import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { designTokensDark, designTokensLight, type DesignTokens } from './design-tokens';

const tokenDir = dirname(fileURLToPath(import.meta.url));
const globalCss = readFileSync(join(tokenDir, '../../global.css'), 'utf8');

function hexToRgbChannels(hex: string): string {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** CSS 变量名（kebab）→ DesignTokens 字段 */
const cssVarToTokenKey: Record<string, keyof DesignTokens> = {
  canvas: 'canvas',
  drawer: 'drawer',
  surface: 'surface',
  subtle: 'subtle',
  'surface-hover': 'surfaceHover',
  'composer-border': 'composerBorder',
  'composer-placeholder': 'composerPlaceholder',
  'user-bubble': 'userBubble',
  'user-bubble-border': 'userBubbleBorder',
  primary: 'primary',
  'primary-pressed': 'primaryPressed',
  'primary-foreground': 'primaryForeground',
  'subtle-pressed': 'subtlePressed',
  secondary: 'secondary',
  muted: 'muted',
  link: 'link',
  approval: 'approvalBg',
  'approval-text': 'approvalText',
  rejection: 'rejectionBg',
  'rejection-text': 'rejectionText',
  'rejection-border': 'rejectionBorder',
  'rejection-border-pressed': 'rejectionBorderPressed',
  warning: 'warning',
  danger: 'danger',
  border: 'border',
  'terminal-bg': 'terminalBg',
  'terminal-header-bg': 'terminalHeaderBg',
  'terminal-fg': 'terminalFg',
  'terminal-muted': 'terminalMuted',
  'terminal-accent': 'terminalAccent',
};

function extractBlock(scheme: ':root' | '.dark'): Record<string, string> {
  const pattern =
    scheme === ':root'
      ? /:root\s*\{([^}]+)\}/
      : /\.dark\s*\{([^}]+)\}/;
  const match = globalCss.match(pattern);
  if (!match) {
    throw new Error(`Missing ${scheme} block in global.css`);
  }
  const vars: Record<string, string> = {};
  for (const line of match[1]?.split('\n') ?? []) {
    const m = line.match(/^\s*--([a-z0-9-]+):\s*([\d\s]+);/);
    if (m?.[1] && m[2]) {
      vars[m[1]] = m[2].trim();
    }
  }
  return vars;
}

function assertCssMatchesTokens(
  blockName: ':root' | '.dark',
  tokens: DesignTokens,
): void {
  const vars = extractBlock(blockName);
  for (const [cssName, tokenKey] of Object.entries(cssVarToTokenKey)) {
    const cssRgb = vars[cssName];
    const hex = tokens[tokenKey];
    expect(cssRgb, `${blockName} --${cssName}`).toBeDefined();
    expect(hexToRgbChannels(hex as string), tokenKey).toBe(cssRgb);
  }
}

describe('design-tokens vs global.css', () => {
  it('light tokens match :root RGB channels', () => {
    assertCssMatchesTokens(':root', designTokensLight);
  });

  it('dark tokens match .dark RGB channels', () => {
    assertCssMatchesTokens('.dark', designTokensDark);
  });
});
