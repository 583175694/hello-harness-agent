import { useAgentHostConversation, useAgentHostSession } from './use-agent-host';

export function useSessionDetail() {
  const {
    selectedSessionId,
    sessionDetail,
    sessionDetailLoading,
    selectSession,
    updateSession,
    deleteSession,
  } = useAgentHostSession();
  const conversation = useAgentHostConversation();
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
