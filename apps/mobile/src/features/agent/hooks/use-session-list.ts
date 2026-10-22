import { useAgentHost } from './use-agent-host';

export function useSessionList() {
  const { sessions, sessionsLoading, refreshSessions, createSession } = useAgentHost();
  return { sessions, sessionsLoading, refreshSessions, createSession };
}
