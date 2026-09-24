import { createAgentClient, type AgentClient } from '@harness/agent-client';

import { getApiBaseUrl } from './storage';

let cachedBaseUrl = '';
let client: AgentClient | null = null;

export function getAgentClient(): AgentClient {
  const baseUrl = getApiBaseUrl();
  if (!client || cachedBaseUrl !== baseUrl) {
    cachedBaseUrl = baseUrl;
    client = createAgentClient({
      baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
  return client;
}

export function resetAgentClient(): void {
  client = null;
  cachedBaseUrl = '';
}
