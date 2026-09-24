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
  if (kind === 'source') return 'sources';
  if (kind === 'report') return 'report';
  if (kind === 'artifact') return 'artifact';
  return 'activity';
}

export function runTerminalStatus(type: 'run.completed' | 'run.failed' | 'run.cancelled') {
  if (type === 'run.completed') return 'completed';
  if (type === 'run.cancelled') return 'cancelled';
  return 'failed';
}
