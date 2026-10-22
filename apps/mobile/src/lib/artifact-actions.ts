import type { AgentClient } from '@harness/agent-client';
import type { ReportRef } from '@harness/agent-protocol';
import * as Linking from 'expo-linking';

export type ReportAggregate = {
  report: ReportRef;
  markdown: string;
  contentType: string;
};

export async function openArtifactDownload(client: AgentClient, artifactId: string): Promise<void> {
  const url = client.getArtifactDownloadUrl(artifactId);
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error('无法打开下载链接');
  }
  await Linking.openURL(url);
}

export async function loadArtifactPreviewText(
  client: AgentClient,
  artifactId: string,
  signal?: AbortSignal,
): Promise<{ content: string; contentType: string }> {
  const preview = await client.getArtifactPreview(artifactId, signal);
  return { content: preview.content, contentType: preview.contentType };
}

/** M-RPT-1：`GET .../artifacts/reports/:id` + artifact 预览正文。 */
export async function loadReportAggregate(
  client: AgentClient,
  reportId: string,
  signal?: AbortSignal,
): Promise<ReportAggregate> {
  const bundle = await client.getReport(reportId, signal);
  const preview = await client.getArtifactPreview(bundle.artifact.artifactId, signal);
  return {
    report: bundle.report,
    markdown: preview.content,
    contentType: preview.contentType,
  };
}

export async function loadReportAggregateForArtifact(
  client: AgentClient,
  artifactId: string,
  signal?: AbortSignal,
): Promise<ReportAggregate> {
  const bundle = await client.getReportForArtifact(artifactId, signal);
  const preview = await client.getArtifactPreview(bundle.artifact.artifactId, signal);
  return {
    report: bundle.report,
    markdown: preview.content,
    contentType: preview.contentType,
  };
}
