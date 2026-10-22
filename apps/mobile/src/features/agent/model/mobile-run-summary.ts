import type { WorkbenchState } from '@harness/agent-ui-types';
import { ACTIVITY_STATUS_COPY } from '../config/activity-status-copy';

export function mobileRunSummaryLine(workbench?: WorkbenchState): string | undefined {
  if (!workbench?.activityStatus) return undefined;
  const copy = ACTIVITY_STATUS_COPY[workbench.activityStatus];
  if (!copy) return undefined;
  if (workbench.activityStatus === 'running' && workbench.plan?.plan?.length) {
    const steps = workbench.plan.plan;
    const currentIndex = steps.findIndex((step) => step.status === 'in_progress');
    const index = currentIndex >= 0 ? currentIndex : steps.findIndex((step) => step.status === 'pending');
    if (index >= 0) {
      return `第 ${index + 1}/${steps.length} 步 · ${steps[index]?.step ?? copy.title}`;
    }
  }
  return copy.title;
}

export function mobileRunPeekSubtitle(workbench?: WorkbenchState): string | undefined {
  if (!workbench?.activityStatus) return undefined;
  return ACTIVITY_STATUS_COPY[workbench.activityStatus]?.subtitle;
}

export function mobileRunPeekVisible(workbench?: WorkbenchState, activeRunId?: string | null): boolean {
  if (!activeRunId || !workbench) return false;
  const status = workbench.activityStatus;
  if (!status) return true;
  return status !== 'completed' && status !== 'cancelled' && status !== 'failed';
}
