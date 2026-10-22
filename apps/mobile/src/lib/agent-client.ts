import { createAgentClient, type AgentClient } from '@harness/agent-client';

import { loadPreferences } from './preferences';

export function resolveMobileApiBaseUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.trim();
  return trimmed || 'http://127.0.0.1:4318';
}

/** 持久化 API Base URL → 共享 HTTP 客户端（P0：readyz / P1+ Session）。 */
export async function createMobileAgentClient(): Promise<AgentClient> {
  const prefs = await loadPreferences();
  return createMobileAgentClientForBaseUrl(prefs.apiBaseUrl);
}

export function createMobileAgentClientForBaseUrl(apiBaseUrl: string): AgentClient {
  return createAgentClient({ baseUrl: resolveMobileApiBaseUrl(apiBaseUrl) });
}
