import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'harness-theme';
const FONT_SIZE_STORAGE_KEY = 'harness-content-font-size';

export const CONTENT_FONT_SIZE_MIN = 12;
export const CONTENT_FONT_SIZE_MAX = 17;
export const CONTENT_FONT_SIZE_DEFAULT = 14;

const THEME_CHANGE_EVENT = 'harness-theme-change';
const FONT_SIZE_CHANGE_EVENT = 'harness-font-size-change';

function clampContentFontSize(value: number): number {
  return Math.min(CONTENT_FONT_SIZE_MAX, Math.max(CONTENT_FONT_SIZE_MIN, Math.round(value)));
}

function readStoredContentFontSize(): number {
  const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  if (!stored) return CONTENT_FONT_SIZE_DEFAULT;
  const parsed = Number.parseInt(stored, 10);
  if (Number.isNaN(parsed)) return CONTENT_FONT_SIZE_DEFAULT;
  return clampContentFontSize(parsed);
}

export function readStoredTheme(): Theme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function readDocumentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function readDocumentContentFontSize(): number {
  if (typeof document === 'undefined') return CONTENT_FONT_SIZE_DEFAULT;
  const raw = document.documentElement.style.getPropertyValue('--h-content-font-size');
  const parsed = Number.parseInt(raw, 10);
  if (Number.isInteger(parsed)) return clampContentFontSize(parsed);
  return readStoredContentFontSize();
}

let themeObserver: MutationObserver | undefined;
const themeListeners = new Set<() => void>();

function ensureThemeObserver(): void {
  if (themeObserver || typeof document === 'undefined') return;
  themeObserver = new MutationObserver(() => {
    for (const listener of themeListeners) listener();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

export function subscribeDocumentTheme(onStoreChange: () => void): () => void {
  ensureThemeObserver();
  themeListeners.add(onStoreChange);
  return () => {
    themeListeners.delete(onStoreChange);
  };
}

const fontSizeListeners = new Set<() => void>();

export function subscribeContentFontSize(onStoreChange: () => void): () => void {
  if (typeof window !== 'undefined') {
    window.addEventListener(FONT_SIZE_CHANGE_EVENT, onStoreChange);
  }
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(FONT_SIZE_CHANGE_EVENT, onStoreChange);
    }
  };
}

export function useDocumentTheme(): Theme {
  return useSyncExternalStore(subscribeDocumentTheme, readDocumentTheme, () => 'light');
}

export function useContentFontSizeValue(): number {
  return useSyncExternalStore(
    subscribeContentFontSize,
    readDocumentContentFontSize,
    () => CONTENT_FONT_SIZE_DEFAULT,
  );
}

export function applyContentFontSize(sizePx: number): void {
  const size = clampContentFontSize(sizePx);
  document.documentElement.style.setProperty('--h-content-font-size', `${size}px`);
}

/** 同步 DOM 主题；不触发 React，由 MutationObserver / 事件通知订阅方。 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function setThemePreference(theme: Theme): void {
  if (readDocumentTheme() !== theme) {
    applyTheme(theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#141414' : '#f7f7f6');
  }
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function toggleThemePreference(): void {
  setThemePreference(readDocumentTheme() === 'dark' ? 'light' : 'dark');
}

export function setContentFontSizePreference(size: number): void {
  const next = clampContentFontSize(size);
  if (readDocumentContentFontSize() === next) return;
  applyContentFontSize(next);
  window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
  window.dispatchEvent(new Event(FONT_SIZE_CHANGE_EVENT));
}

/** 在 React mount 前调用，与 index.html boot script 对齐。 */
export function bootstrapAppearance(): void {
  applyTheme(readStoredTheme());
  applyContentFontSize(readStoredContentFontSize());
}

export function useThemeControls(): {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
} {
  const theme = useDocumentTheme();
  const toggleTheme = useCallback(() => {
    toggleThemePreference();
  }, []);
  const setTheme = useCallback((next: Theme) => {
    setThemePreference(next);
  }, []);
  return { theme, toggleTheme, setTheme };
}

export function useContentFontSizeControls(): {
  fontSize: number;
  setFontSize: (size: number) => void;
} {
  const fontSize = useContentFontSizeValue();
  const setFontSize = useCallback((size: number) => {
    setContentFontSizePreference(size);
  }, []);
  return { fontSize, setFontSize };
}

/** @deprecated 使用 useThemeControls / DOM API；保留以免破坏外部引用。 */
export function useTheme(): [Theme, () => void, (theme: Theme) => void] {
  const { theme, toggleTheme, setTheme } = useThemeControls();
  return [theme, toggleTheme, setTheme];
}

/** @deprecated 使用 useContentFontSizeControls。 */
export function useContentFontSize(): [number, (size: number) => void] {
  const { fontSize, setFontSize } = useContentFontSizeControls();
  return [fontSize, setFontSize];
}
