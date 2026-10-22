import * as Linking from 'expo-linking';
import { useEffect } from 'react';

function sessionIdFromUrl(url: string): string | undefined {
  const parsed = Linking.parse(url);
  const raw = parsed.queryParams?.session;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].length > 0) {
    return raw[0];
  }
  return undefined;
}

/** M-SES-6：对齐 Web `?session=`，支持 `harness://agent?session=`。 */
export function useSessionDeepLink(selectSession: (sessionId: string) => Promise<void>): void {
  useEffect(() => {
    const openFromUrl = async (url: string | null) => {
      if (!url) return;
      const sessionId = sessionIdFromUrl(url);
      if (sessionId) {
        await selectSession(sessionId);
      }
    };

    void Linking.getInitialURL().then((url) => openFromUrl(url));
    const subscription = Linking.addEventListener('url', (event) => {
      void openFromUrl(event.url);
    });
    return () => subscription.remove();
  }, [selectSession]);
}
