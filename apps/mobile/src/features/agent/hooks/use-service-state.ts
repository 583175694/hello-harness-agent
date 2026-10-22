import { useAgentHost } from './use-agent-host';

export function useServiceState() {
  const { serviceState, refreshReadiness } = useAgentHost();
  return { serviceState, refreshReadiness };
}
