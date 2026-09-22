import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'harness-theme';
const FONT_SIZE_STORAGE_KEY = 'harness-content-font-size';

export const CONTENT_FONT_SIZE_MIN = 12;
export const CONTENT_FONT_SIZE_MAX = 17;
export const CONTENT_FONT_SIZE_DEFAULT = 14;

function clampContentFontSize(value: number): number {
  return Math.min(CONTENT_FONT_SIZE_MAX, Math.max(CONTENT_FONT_SIZE_MIN, Math.round(value)));
}

function readInitialContentFontSize(): number {
  const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  if (!stored) return CONTENT_FONT_SIZE_DEFAULT;
  const parsed = Number.parseInt(stored, 10);
  if (Number.isNaN(parsed)) return CONTENT_FONT_SIZE_DEFAULT;
  return clampContentFontSize(parsed);
}

function readInitialTheme(): Theme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyContentFontSize(sizePx: number): void {
  const size = clampContentFontSize(sizePx);
  const root = document.documentElement;
  root.style.setProperty('--h-content-font-size', `${size}px`);
}

export function applyTheme(theme: Theme, animate = false): void {
  const root = document.documentElement;

  if (animate) {
    root.classList.add('theme-transition');
  }

  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  if (animate) {
    window.setTimeout(() => {
      root.classList.remove('theme-transition');
    }, 160);
  }
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = readInitialTheme();
    applyTheme(initial);
    applyContentFontSize(readInitialContentFontSize());
    return initial;
  });

  useEffect(() => {
    applyTheme(theme, true);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return [theme, () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))];
}

export function useContentFontSize(): [number, (size: number) => void] {
  const [fontSize, setFontSize] = useState<number>(() => {
    const initial = readInitialContentFontSize();
    applyContentFontSize(initial);
    return initial;
  });

  useEffect(() => {
    applyContentFontSize(fontSize);
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSize));
  }, [fontSize]);

  return [fontSize, (next) => setFontSize(clampContentFontSize(next))];
}
