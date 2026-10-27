import AsyncStorage from '@react-native-async-storage/async-storage';

/** 未在设置中覆盖时使用的默认 Agent API（线上）。 */
export const MOBILE_DEFAULT_API_BASE_URL = 'http://175.178.23.83:4317';

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
  apiBaseUrl: MOBILE_DEFAULT_API_BASE_URL,
  themeMode: 'system',
  contentFontSize: 14,
  allowAgentMemoryWrite: true,
  pushNotificationsEnabled: true,
};

const STORAGE_KEY = '@harness/mobile/preferences/v1';

/** 去掉末尾 `/`，避免与 path 拼接异常。 */
export function normalizeApiBaseUrlInput(apiBaseUrl: string | undefined): string {
  return (apiBaseUrl ?? '').trim().replace(/\/+$/, '');
}

/** 旧版本/local 调试地址 → 当前默认线上 API。 */
function migrateApiBaseUrl(stored: string | undefined): string {
  const normalized = normalizeApiBaseUrlInput(stored);
  if (!normalized) return MOBILE_DEFAULT_API_BASE_URL;
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(normalized)) {
    return MOBILE_DEFAULT_API_BASE_URL;
  }
  if (/^https?:\/\/175\.178\.23\.83:4318$/i.test(normalized)) {
    return MOBILE_DEFAULT_API_BASE_URL;
  }
  return normalized;
}

export async function loadPreferences(): Promise<AppPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      apiBaseUrl: migrateApiBaseUrl(parsed.apiBaseUrl),
      contentFontSize: clampFontSize(parsed.contentFontSize ?? DEFAULT_PREFERENCES.contentFontSize),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(next: AppPreferences): Promise<void> {
  const normalized: AppPreferences = {
    ...next,
    apiBaseUrl: normalizeApiBaseUrlInput(next.apiBaseUrl),
    contentFontSize: clampFontSize(next.contentFontSize),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function clampFontSize(size: number): number {
  return Math.min(17, Math.max(12, Math.round(size)));
}
