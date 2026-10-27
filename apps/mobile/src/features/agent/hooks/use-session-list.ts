import { useAgentHostSession } from './use-agent-host';

export function useSessionList() {
  const { sessions, sessionsLoading, refreshSessions, createSession } = useAgentHostSession();
  return { sessions, sessionsLoading, refreshSessions, createSession };
}
