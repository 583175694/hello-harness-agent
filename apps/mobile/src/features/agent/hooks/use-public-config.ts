import { useAgentHostComposerSnapshot } from './use-agent-run-ui-slices';

export function usePublicConfig() {
  const { defaultModelId } = useAgentHostComposerSnapshot();
  return { defaultModelId };
}
