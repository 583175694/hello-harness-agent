import AsyncStorage from '@react-native-async-storage/async-storage';

const SELECTED_SESSION_KEY = '@harness/mobile/selected-session/v1';
const SESSION_REPORT_IDS_KEY = '@harness/mobile/session-report-ids/v1';

export type SessionReportIdMap = Record<string, string>;

export async function loadSelectedSessionId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SELECTED_SESSION_KEY);
  } catch {
    return null;
  }
}

export async function loadSessionReportIds(): Promise<SessionReportIdMap> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_REPORT_IDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as SessionReportIdMap;
  } catch {
    return {};
  }
}

export async function saveSessionReportId(sessionId: string, reportId: string): Promise<void> {
  try {
    const current = await loadSessionReportIds();
    current[sessionId] = reportId;
    await AsyncStorage.setItem(SESSION_REPORT_IDS_KEY, JSON.stringify(current));
  } catch {
    // ignore persistence failures
  }
}

export async function saveSelectedSessionId(sessionId: string | null): Promise<void> {
  try {
    if (!sessionId) {
      await AsyncStorage.removeItem(SELECTED_SESSION_KEY);
      return;
    }
    await AsyncStorage.setItem(SELECTED_SESSION_KEY, sessionId);
  } catch {
    // ignore persistence failures
  }
}
