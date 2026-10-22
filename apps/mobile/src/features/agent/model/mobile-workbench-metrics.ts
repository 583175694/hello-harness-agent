import type { ConversationItem, WorkbenchState } from '@harness/agent-ui-types';

const ACTIVE_TOOL_ACTIVITY_STATUSES = new Set([
  'running',
  'queued',
  'waiting',
  'cancelling',
]);

export function countWorkbenchArtifacts(workbench?: WorkbenchState): number {
  if (!workbench) return 0;
  if (workbench.artifacts?.length) return workbench.artifacts.length;
  return (
    workbench.artifactSeries?.reduce((sum, series) => sum + series.versions.length, 0) ?? 0
  );
}

function countActiveToolActivityBlocks(
  conversation: ConversationItem[],
  activeRunId: string | undefined,
): number {
  if (!activeRunId) return 0;
  let count = 0;
  for (const item of conversation) {
    if (item.kind !== 'assistant' || item.runId !== activeRunId) continue;
    for (const block of item.blocks) {
      if (
        block.type === 'tool_activity' &&
        ACTIVE_TOOL_ACTIVITY_STATUSES.has(block.status)
      ) {
        count += 1;
      }
    }
  }
  return count;
}

/** 对齐 docs/36 §5.5.3：active Run 上进行中 tool_activity + Workbench artifact 条数。 */
export function mobileWorkbenchBadgeCount(input: {
  workbench?: WorkbenchState;
  conversation: ConversationItem[];
  activeRunId?: string | null;
}): number {
  const artifacts = countWorkbenchArtifacts(input.workbench);
  const activeTools = countActiveToolActivityBlocks(
    input.conversation,
    input.activeRunId ?? undefined,
  );
  if (input.activeRunId) {
    return activeTools + artifacts;
  }
  return artifacts;
}

export function mobileWorkbenchActivityEmphasis(
  workbench?: WorkbenchState,
): 'default' | 'sources' {
  const hasSources = (workbench?.sources?.length ?? 0) > 0;
  const hasWebTools = workbench?.executions?.some(
    (item) => item.toolName === 'web_search' || item.toolName === 'web_fetch',
  );
  return hasSources && hasWebTools ? 'sources' : 'default';
}
