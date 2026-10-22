import { useAgentHost } from './use-agent-host';

export function useActiveRun() {
  const { submitRun, cancelActiveRun, runSubmitting, activeRunId, connectionState } = useAgentHost();
  return { submitRun, cancelActiveRun, runSubmitting, activeRunId, connectionState };
}
