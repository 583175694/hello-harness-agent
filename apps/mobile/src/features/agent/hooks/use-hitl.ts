import { useAgentHostComposerSnapshot, useAgentHostSession } from './use-agent-host';

export function useHitl() {
  const { cancelActiveRun, respondClarification, respondToolApproval } = useAgentHostSession();
  const { activeInterrupt, hitlSubmitting } = useAgentHostComposerSnapshot();
  return {
    activeInterrupt,
    hitlSubmitting,
    respondClarification,
    respondToolApproval,
    cancelActiveRun,
  };
}
