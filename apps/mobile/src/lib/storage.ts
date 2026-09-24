import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({ id: 'harness-agent-mobile' });

const KEYS = {
  apiBaseUrl: 'apiBaseUrl',
  lastSessionId: 'lastSessionId',
  contentFontSize: 'contentFontSize',
  pushNotificationsEnabled: 'pushNotificationsEnabled',
  theme: 'theme',
} as const;

export function getApiBaseUrl(): string {
  return storage.getString(KEYS.apiBaseUrl) ?? '';
}

export function setApiBaseUrl(value: string): void {
  storage.set(KEYS.apiBaseUrl, value.replace(/\/$/, ''));
}

export function getLastSessionId(): string | null {
  return storage.getString(KEYS.lastSessionId) ?? null;
}

export function setLastSessionId(sessionId: string | null): void {
  if (sessionId) storage.set(KEYS.lastSessionId, sessionId);
  else storage.delete(KEYS.lastSessionId);
}

export function getContentFontSize(): number {
  return storage.getNumber(KEYS.contentFontSize) ?? 15;
}

export function setContentFontSize(size: number): void {
  storage.set(KEYS.contentFontSize, size);
}

export function getPushNotificationsEnabled(): boolean {
  return storage.getBoolean(KEYS.pushNotificationsEnabled) ?? false;
}

export function setPushNotificationsEnabled(enabled: boolean): void {
  storage.set(KEYS.pushNotificationsEnabled, enabled);
}

export function getThemePreference(): 'light' | 'dark' | 'system' {
  const value = storage.getString(KEYS.theme);
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

export function setThemePreference(theme: 'light' | 'dark' | 'system'): void {
  storage.set(KEYS.theme, theme);
}
