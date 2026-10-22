import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type RunNotificationKind = 'completed' | 'failed' | 'clarification' | 'tool_approval';

export function isAppInBackground(): boolean {
  return AppState.currentState.match(/inactive|background/) !== null;
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

const defaultBodies: Record<RunNotificationKind, string> = {
  completed: '任务已完成',
  failed: '任务未完成',
  clarification: '需要你的确认',
  tool_approval: '需要批准工具调用',
};

export async function notifyRunAttention(params: {
  enabled: boolean;
  sessionId: string;
  sessionTitle: string;
  kind: RunNotificationKind;
  detail?: string;
}): Promise<void> {
  if (!params.enabled || !isAppInBackground()) return;
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: params.sessionTitle,
      body: params.detail?.trim() || defaultBodies[params.kind],
      data: { sessionId: params.sessionId, kind: params.kind },
    },
    trigger: null,
  });
}

export function bindRunNotificationDeepLink(selectSession: (sessionId: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const sessionId = response.notification.request.content.data?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) return;
    void Linking.openURL(`harness://agent?session=${encodeURIComponent(sessionId)}`);
    void selectSession(sessionId);
  });
  return () => subscription.remove();
}
