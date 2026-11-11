import { PlanStepRow } from '../preview/PreviewModels';

export interface PlanSnapshotRow {
  explanation?: string;
  steps: PlanStepRow[];
}

/** 对齐 mobile-core `PlanProjector`。 */
export class HarmonyPlanProjector {
  static parsePlan(payload: Record<string, Object> | undefined): PlanSnapshotRow | undefined {
    if (payload === undefined) {
      return undefined;
    }
    const rawPlan = payload['plan'] as Array<Record<string, Object>> | undefined;
    if (rawPlan === undefined || rawPlan.length === 0) {
      return undefined;
    }
    const steps: PlanStepRow[] = [];
    rawPlan.forEach((row) => {
      const step = `${row['step'] ?? ''}`.trim();
      if (step.length === 0) {
        return;
      }
      steps.push({
        step,
        status: `${row['status'] ?? 'pending'}`,
      });
    });
    if (steps.length === 0) {
      return undefined;
    }
    const explanation = `${payload['explanation'] ?? ''}`.trim();
    return {
      explanation: explanation.length > 0 ? explanation : undefined,
      steps,
    };
  }

  static shouldShowOverlay(
    plan: PlanSnapshotRow | undefined,
    runActive: boolean,
  ): boolean {
    if (!runActive || plan === undefined || plan.steps.length === 0) {
      return false;
    }
    return plan.steps.some((s) => s.status !== 'completed');
  }
}
