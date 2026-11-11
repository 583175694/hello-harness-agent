import { WorkbenchPreviewState } from '../preview/PreviewModels';

export interface WorkbenchFocusTargetRow {
  kind: string;
  runId: string;
  toolCallId?: string;
  stepId?: string;
  artifactId?: string;
}

export interface WorkbenchFocusApplyRow {
  view: string;
  focusTarget: WorkbenchFocusTargetRow;
  focusedToolCallId?: string;
  degraded: boolean;
  hint?: string;
}

export class HarmonyWorkbenchFocusProjector {
  static viewFromKind(kind: string): string {
    if (kind === 'source' || kind === 'sources') {
      return 'sources';
    }
    if (kind === 'report') {
      return 'report';
    }
    if (kind === 'artifact') {
      return 'artifact';
    }
    return 'activity';
  }

  static apply(workbench: WorkbenchPreviewState, target: WorkbenchFocusTargetRow): WorkbenchFocusApplyRow {
    if (target.kind === 'tool_call') {
      const toolId = target.toolCallId ?? target.stepId ?? '';
      if (toolId.length === 0) {
        return HarmonyWorkbenchFocusProjector.degradedActivity(target, '无法定位工具步骤，已打开 Activity 总览');
      }
      const exists = workbench.toolExecutions.some((t) => t.id === toolId);
      if (!exists) {
        return HarmonyWorkbenchFocusProjector.degradedActivity(target, '无法定位工具步骤，已打开 Activity 总览');
      }
      return {
        view: 'activity',
        focusTarget: target,
        focusedToolCallId: toolId,
        degraded: false,
      };
    }
    const view = HarmonyWorkbenchFocusProjector.viewFromKind(target.kind);
    return {
      view,
      focusTarget: target,
      degraded: false,
    };
  }

  private static degradedActivity(target: WorkbenchFocusTargetRow, hint: string): WorkbenchFocusApplyRow {
    return {
      view: 'activity',
      focusTarget: {
        kind: 'activity',
        runId: target.runId,
      },
      degraded: true,
      hint,
    };
  }
}
