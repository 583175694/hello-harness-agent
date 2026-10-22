import { useAgentHost } from './use-agent-host';

export function useSessionDetail() {
  const {
    selectedSessionId,
    sessionDetail,
    sessionDetailLoading,
    conversation,
    selectSession,
    updateSession,
    deleteSession,
  } = useAgentHost();
  return {
    selectedSessionId,
    sessionDetail,
    sessionDetailLoading,
    conversation,
    selectSession,
    updateSession,
    deleteSession,
  };
}
