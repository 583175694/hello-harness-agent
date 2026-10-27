import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_TOKEN_KEY = '@harness/mobile/auth/session-token/v1';

export async function getSessionToken(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
    return value?.trim() ? value : null;
  } catch {
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
}
