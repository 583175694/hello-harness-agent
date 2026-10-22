import type { ArtifactRef } from '@harness/agent-protocol';
import type { WorkbenchState } from '@harness/agent-ui-types';

export function listWorkbenchArtifacts(workbench?: WorkbenchState): ArtifactRef[] {
  if (!workbench) return [];
  const merged = new Map<string, ArtifactRef>();
  for (const artifact of workbench.artifacts ?? []) {
    merged.set(artifact.artifactId, artifact);
  }
  for (const series of workbench.artifactSeries ?? []) {
    for (const version of series.versions) {
      merged.set(version.artifactId, version);
    }
  }
  return [...merged.values()];
}
