import { useAgentHost } from './use-agent-host';

/** P2：默认模型由 AgentHost run 层加载；此 hook 预留 P3+ 模型菜单。 */
export function usePublicConfig() {
  const { defaultModelId } = useAgentHost();
  return { defaultModelId };
}
