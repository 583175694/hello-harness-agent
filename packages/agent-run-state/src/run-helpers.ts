import type { WorkbenchFocusTarget, WorkbenchState, WorkspaceView } from '@harness/agent-ui-types';

export function snapshotDeliveryStatus(
  status: string,
): 'completed' | 'cancelled' | 'failed' | 'streaming' {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';
  return 'streaming';
}

export function snapshotActivityStatus(
  controlStatus: string | undefined,
  status: string,
): WorkbenchState['activityStatus'] {
  if (
    controlStatus === 'paused' ||
    controlStatus === 'pause_requested' ||
    controlStatus === 'resuming' ||
    controlStatus === 'waiting_for_user'
  ) {
    return controlStatus;
  }
  if (status === 'cancelled' || status === 'failed' || status === 'completed') return status;
  return 'running';
}

export function workbenchViewFromTarget(kind: WorkbenchFocusTarget['kind']): WorkspaceView {
  if (kind === 'source' || kind === 'tool_call' || kind === 'activity') return 'tool_results';
  if (kind === 'report' || kind === 'artifact') return 'deliverables';
  return 'tool_results';
}

export function runTerminalStatus(type: 'run.completed' | 'run.failed' | 'run.cancelled') {
  if (type === 'run.completed') return 'completed';
  if (type === 'run.cancelled') return 'cancelled';
  return 'failed';
}
