import type { FileRef } from '@harness/agent-protocol';
import type { AgentUiState, WorkbenchState } from '@harness/agent-ui-types';

export function optimisticRevisionAttachments(
  explicitAttachments: FileRef[],
  revisionContext: AgentUiState['revisionContext'],
  workbench?: WorkbenchState,
): FileRef[] {
  if (!revisionContext) return explicitAttachments;
  const baseArtifact = workbench?.artifactSeries
    ?.flatMap((series) => series.versions)
    .find((artifact) => artifact.artifactId === revisionContext.baseArtifactId);
  if (!baseArtifact || explicitAttachments.some((item) => item.fileId === baseArtifact.fileId))
    return explicitAttachments;
  return [
    ...explicitAttachments,
    {
      fileId: baseArtifact.fileId,
      fileName: baseArtifact.fileName,
      mediaType: baseArtifact.mediaType,
      size: baseArtifact.size,
      status: 'ready',
      fileKind: baseArtifact.fileKind,
      origin: 'agent_generated',
      artifactId: baseArtifact.artifactId,
      ...(baseArtifact.lineCount === undefined ? {} : { lineCount: baseArtifact.lineCount }),
      ...(baseArtifact.characterCount === undefined
        ? {}
        : { characterCount: baseArtifact.characterCount }),
    },
  ];
}
