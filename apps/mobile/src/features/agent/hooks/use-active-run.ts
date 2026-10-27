import {
  useAgentHostConnectionState,
  useAgentHostComposerSnapshot,
  useAgentHostSession,
  useAgentHostWorkbenchSnapshot,
} from './use-agent-host';

export function useActiveRun() {
  const { submitRun, cancelActiveRun } = useAgentHostSession();
  const { runSubmitting } = useAgentHostComposerSnapshot();
  const { activeRunId } = useAgentHostWorkbenchSnapshot();
  const connectionState = useAgentHostConnectionState();
  return { submitRun, cancelActiveRun, runSubmitting, activeRunId, connectionState };
}
