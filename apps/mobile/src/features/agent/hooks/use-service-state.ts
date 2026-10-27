import { useAgentHostSession } from './use-agent-host';

export function useServiceState() {
  const { serviceState, refreshReadiness } = useAgentHostSession();
  return { serviceState, refreshReadiness };
}
