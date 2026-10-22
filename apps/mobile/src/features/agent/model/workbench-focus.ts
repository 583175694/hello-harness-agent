import type { ArtifactRef } from '@harness/agent-protocol';
import type { ToolCallView, WorkbenchFocusTarget } from '@harness/agent-ui-types';
import type { WorkspaceView } from '../fixtures/ui-fixtures';

const ARTIFACT_TOOL_NAMES = new Set(['create_file', 'create_report']);

export function mobileWorkbenchViewFromFocus(kind: WorkbenchFocusTarget['kind']): WorkspaceView {
  if (kind === 'artifact' || kind === 'report') return 'artifact';
  return 'activity';
}

export function resolveToolCallIndex(
  executions: ToolCallView[],
  focusTarget?: WorkbenchFocusTarget,
  artifacts?: ArtifactRef[],
): number {
  if (!executions.length) return 0;
  if (focusTarget?.kind === 'tool_call') {
    const index = executions.findIndex((tool) => tool.toolCallId === focusTarget.toolCallId);
    if (index >= 0) return index;
  }
  if (focusTarget?.kind === 'artifact') {
    const byArtifactId = executions.findIndex(
      (tool) => tool.artifactId === focusTarget.artifactId,
    );
    if (byArtifactId >= 0) return byArtifactId;
    const artifact = artifacts?.find((item) => item.artifactId === focusTarget.artifactId);
    if (artifact) {
      const byFileName = executions.findIndex(
        (tool) =>
          ARTIFACT_TOOL_NAMES.has(tool.toolName) &&
          (tool.title.includes(artifact.fileName) ||
            tool.inputSummary.includes(artifact.fileName)),
      );
      if (byFileName >= 0) return byFileName;
    }
  }
  return executions.length - 1;
}

export function resolveFocusedToolCallId(
  executions: ToolCallView[],
  focusTarget?: WorkbenchFocusTarget,
  artifacts?: ArtifactRef[],
  overrideToolCallId?: string | null,
): string | undefined {
  if (overrideToolCallId) {
    return executions.some((t) => t.toolCallId === overrideToolCallId)
      ? overrideToolCallId
      : undefined;
  }
  const index = resolveToolCallIndex(executions, focusTarget, artifacts);
  return executions[index]?.toolCallId;
}
