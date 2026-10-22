import type { ArtifactRef, SessionDetail } from '@harness/agent-protocol';
import { assistantAgentMetadataRestoreSchema } from '@harness/agent-protocol';

function isReportMarkdownArtifact(artifact: ArtifactRef): boolean {
  if (artifact.fileKind !== 'markdown') return false;
  const name = artifact.logicalName ?? artifact.fileName;
  return /\.md$/iu.test(name);
}

function artifactsFromSessionDetail(session: SessionDetail): ArtifactRef[] {
  const merged = new Map<string, ArtifactRef>();
  for (const series of session.artifactSeries ?? []) {
    for (const version of series.versions) {
      merged.set(version.artifactId, version);
    }
  }
  for (const message of session.messages) {
    if (message.role !== 'assistant') continue;
    const metadata = assistantAgentMetadataRestoreSchema.safeParse(message.metadata);
    if (!metadata.success) continue;
    for (const block of metadata.data.blocks ?? []) {
      if (block.type === 'artifact') {
        merged.set(block.artifactId, block);
      }
    }
  }
  return [...merged.values()];
}

/** 冷启动：从 Session 持久化数据推断最新报告 artifact（用于 `GET .../artifacts/:id/report`）。 */
export function inferLatestReportArtifactId(session: SessionDetail): string | undefined {
  const candidates = artifactsFromSessionDetail(session).filter(isReportMarkdownArtifact);
  if (!candidates.length) return undefined;
  const sorted = [...candidates].sort((left, right) => {
    const leftVersion = left.versionNumber ?? 0;
    const rightVersion = right.versionNumber ?? 0;
    if (leftVersion !== rightVersion) return rightVersion - leftVersion;
    return right.createdAt.localeCompare(left.createdAt);
  });
  return sorted[0]?.artifactId;
}
