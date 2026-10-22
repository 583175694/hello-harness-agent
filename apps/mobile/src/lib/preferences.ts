import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

export type AppPreferences = {
  apiBaseUrl: string;
  themeMode: ThemeMode;
  contentFontSize: number;
  allowAgentMemoryWrite: boolean;
  /** §7.4：Run 终态 / HITL 本地推送（后台时）。 */
  pushNotificationsEnabled: boolean;
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  apiBaseUrl: '',
  themeMode: 'system',
  contentFontSize: 14,
  allowAgentMemoryWrite: true,
  pushNotificationsEnabled: true,
};

const STORAGE_KEY = '@harness/mobile/preferences/v1';

export async function loadPreferences(): Promise<AppPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      contentFontSize: clampFontSize(parsed.contentFontSize ?? DEFAULT_PREFERENCES.contentFontSize),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(next: AppPreferences): Promise<void> {
  const normalized: AppPreferences = {
    ...next,
    contentFontSize: clampFontSize(next.contentFontSize),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function clampFontSize(size: number): number {
  return Math.min(17, Math.max(12, Math.round(size)));
}
