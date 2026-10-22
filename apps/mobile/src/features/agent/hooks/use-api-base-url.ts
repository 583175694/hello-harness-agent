import { resolveMobileApiBaseUrl } from '@/lib/agent-client';
import { useAppPreferences } from '@/providers/app-preferences-provider';

export function useApiBaseUrl() {
  const { preferences, updatePreferences } = useAppPreferences();
  const apiBaseUrl = resolveMobileApiBaseUrl(preferences.apiBaseUrl);

  return {
    apiBaseUrl,
    rawApiBaseUrl: preferences.apiBaseUrl,
    setApiBaseUrl: (next: string) => updatePreferences({ apiBaseUrl: next }),
  };
}
