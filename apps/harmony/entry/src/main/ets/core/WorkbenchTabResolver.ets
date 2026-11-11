import { WorkbenchPreviewState } from '../preview/PreviewModels';

/** 与 mobile-core `WorkbenchTabResolver` 规则对齐（JVM 单测为权威）。 */
export class WorkbenchTabResolver {
  static visibleTabs(state: WorkbenchPreviewState): string[] {
    const tabs: string[] = ['activity'];
    if (state.sources.length > 0) {
      tabs.push('sources');
    }
    if ((state.reportMarkdown ?? '').trim().length > 0) {
      tabs.push('report');
    }
    if (WorkbenchTabResolver.hasArtifactTab(state)) {
      tabs.push('artifact');
    }
    return tabs;
  }

  static coerceActiveTab(state: WorkbenchPreviewState, requested: string): string {
    const tabs = WorkbenchTabResolver.visibleTabs(state);
    if (tabs.indexOf(requested) >= 0) {
      return requested;
    }
    const initial = state.initialView.length > 0 ? state.initialView : 'activity';
    if (tabs.indexOf(initial) >= 0) {
      return initial;
    }
    return tabs[0];
  }

  static tabLabel(tab: string): string {
    if (tab === 'activity') {
      return '实时跟随';
    }
    if (tab === 'sources') {
      return '来源';
    }
    if (tab === 'report') {
      return '报告';
    }
    if (tab === 'artifact') {
      return '文件';
    }
    return tab;
  }

  private static hasArtifactTab(state: WorkbenchPreviewState): boolean {
    return state.deliverableFiles.length > 0 ||
      state.artifactVersions.length > 0 ||
      state.hasDeliverables === true;
  }
}
