/* eslint-disable @typescript-eslint/ban-ts-comment -- compiled projection bundle */
// @ts-nocheck
export function optimisticRevisionAttachments(explicitAttachments, revisionContext, workbench) {
    if (!revisionContext)
        return explicitAttachments;
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
