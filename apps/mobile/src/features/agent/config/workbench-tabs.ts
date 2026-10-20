import type { WorkspaceView } from '../fixtures/ui-fixtures';

export type WorkbenchTabDef = { id: WorkspaceView; label: string; count?: number };

const TAB_LABELS: Record<WorkspaceView, string> = {
  activity: '实时跟随',
  artifact: '文件',
};

/** 对齐 Web `workbenchHasDeliverablesTab`。 */
export function mobileWorkbenchHasDeliverablesTab(options: {
  workbenchCount?: number;
  hasDeliverables?: boolean;
}): boolean {
  if (options.hasDeliverables !== undefined) {
    return options.hasDeliverables;
  }
  return (options.workbenchCount ?? 0) > 0;
}

export function resolveMobileWorkbenchVisibleTabs(options: {
  workbenchCount?: number;
  hasDeliverables?: boolean;
}): WorkbenchTabDef[] {
  const tabs: WorkbenchTabDef[] = [{ id: 'activity', label: TAB_LABELS.activity }];
  if (mobileWorkbenchHasDeliverablesTab(options)) {
    tabs.push({
      id: 'artifact',
      label: TAB_LABELS.artifact,
      count: options.workbenchCount,
    });
  }
  return tabs;
}

export function normalizeWorkbenchView(
  view: WorkspaceView | undefined,
  visibleTabs: WorkbenchTabDef[],
): WorkspaceView {
  const fallback = visibleTabs[0]?.id ?? 'activity';
  if (!view) {
    return fallback;
  }
  if (visibleTabs.some((tab) => tab.id === view)) {
    return view;
  }
  return fallback;
}
