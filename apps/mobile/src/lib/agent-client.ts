import { createAgentClient, type AgentClient } from '@harness/agent-client';

import { getMobileAuthHeaders } from './mobile-auth-api';
import {
  loadPreferences,
  MOBILE_DEFAULT_API_BASE_URL,
  normalizeApiBaseUrlInput,
} from './preferences';

export { MOBILE_DEFAULT_API_BASE_URL };

export function resolveMobileApiBaseUrl(apiBaseUrl: string): string {
  /** Release 包固定走线上 API，避免 AsyncStorage 里残留 localhost/错误端口。 */
  if (!__DEV__) {
    return MOBILE_DEFAULT_API_BASE_URL;
  }
  const normalized = normalizeApiBaseUrlInput(apiBaseUrl);
  return normalized || MOBILE_DEFAULT_API_BASE_URL;
}

/** 持久化 API Base URL → 共享 HTTP 客户端（P0：readyz / P1+ Session）。 */
export async function createMobileAgentClient(): Promise<AgentClient> {
  const prefs = await loadPreferences();
  return createMobileAgentClientForBaseUrl(prefs.apiBaseUrl);
}

export function createMobileAgentClientForBaseUrl(apiBaseUrl: string): AgentClient {
  return createAgentClient({
    baseUrl: resolveMobileApiBaseUrl(apiBaseUrl),
    getAuthHeaders: getMobileAuthHeaders,
  });
}
