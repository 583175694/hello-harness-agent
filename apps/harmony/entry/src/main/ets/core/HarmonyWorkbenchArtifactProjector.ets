import { ArtifactVersionRow, WorkbenchPreviewState } from '../preview/PreviewModels';
import { ArtifactSeriesRow } from './HarmonyCoreTypes';

/** 对齐 mobile-core WorkbenchArtifactProjector。 */
export class HarmonyWorkbenchArtifactProjector {
  static applySeries(
    snapshot: WorkbenchPreviewState,
    series: ArtifactSeriesRow[],
  ): WorkbenchPreviewState {
    if (series.length === 0) {
      return snapshot;
    }
    const versions = HarmonyWorkbenchArtifactProjector.versionsFromSeries(series);
    if (versions.length === 0) {
      return snapshot;
    }
    const prompt = HarmonyWorkbenchArtifactProjector.restorePrompt(series);
    return {
      ...snapshot,
      artifactVersions: versions,
      artifactRestorePrompt: prompt.length > 0 ? prompt : snapshot.artifactRestorePrompt,
      workbenchCount: Math.max(snapshot.workbenchCount, versions.length),
    };
  }

  static placeholderFromSeries(series: ArtifactSeriesRow[]): WorkbenchPreviewState {
    const count = series.reduce((sum, s) => sum + s.versions.length, 0);
    const base: WorkbenchPreviewState = {
      initialView: 'activity',
      initialSheetIndex: 2,
      workbenchCount: Math.max(count, 1),
      reportMarkdown: '',
      contextJsonPreview: '',
      artifactDiffPreview: '',
      artifactRestorePrompt: '',
      sources: [],
      artifactVersions: [],
      activityTimeline: [],
      toolExecutions: [],
      deliverableFiles: [],
      bashSnippet: '',
      sourcesRetrievalOnly: false,
    };
    return HarmonyWorkbenchArtifactProjector.applySeries(base, series);
  }

  private static versionsFromSeries(series: ArtifactSeriesRow[]): ArtifactVersionRow[] {
    const out: ArtifactVersionRow[] = [];
    for (const s of series) {
      const sorted = [...s.versions].sort(
        (a, b) => (a.versionNumber ?? 0) - (b.versionNumber ?? 0),
      );
      for (const ref of sorted) {
        const vn = ref.versionNumber;
        if (vn === undefined) {
          continue;
        }
        const selected =
          ref.artifactId === (s.currentArtifactId ?? '') || ref.isCurrent === true;
        const suffix = selected ? '（当前）' : '';
        out.push({
          id: ref.artifactId,
          label: `${s.logicalName} · v${vn}${suffix}`,
          selected,
          seriesId: s.seriesId,
          logicalName: s.logicalName,
          versionNumber: vn,
          expectedCurrentArtifactId: s.currentArtifactId ?? undefined,
        });
      }
    }
    return out;
  }

  private static restorePrompt(series: ArtifactSeriesRow[]): string {
    const primary = series.find((s) => s.versions.length > 1) ?? series[0];
    if (primary === undefined) {
      return '';
    }
    return `恢复所选版本将覆盖工作区中的 ${primary.logicalName}。`;
  }
}
