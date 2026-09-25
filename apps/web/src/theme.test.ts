import { beforeEach, describe, expect, it } from 'vitest';

import {
  THEME_STORAGE_KEY,
  applyTheme,
  bootstrapAppearance,
  readDocumentTheme,
  setThemePreference,
  toggleThemePreference,
} from './theme';

describe('theme DOM bridge', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
  });

  it('applies theme to the document root without React state', () => {
    applyTheme('dark');
    expect(readDocumentTheme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('persists preference and toggles through the DOM API', () => {
    setThemePreference('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    toggleThemePreference();
    expect(readDocumentTheme()).toBe('dark');
  });

  it('bootstraps from storage before React mounts', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    bootstrapAppearance();
    expect(readDocumentTheme()).toBe('dark');
  });
});
