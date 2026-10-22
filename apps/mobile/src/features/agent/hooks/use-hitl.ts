import { useAgentHost } from './use-agent-host';

export function useHitl() {
  const {
    activeInterrupt,
    hitlSubmitting,
    respondClarification,
    respondToolApproval,
    cancelActiveRun,
  } = useAgentHost();
  return {
    activeInterrupt,
    hitlSubmitting,
    respondClarification,
    respondToolApproval,
    cancelActiveRun,
  };
}
