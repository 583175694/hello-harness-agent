import {
  artifactRefSchema,
  artifactSeriesRefSchema,
  fileRefSchema,
  reportRefSchema,
  restoreArtifactResultSchema,
  type ArtifactRef,
  type ArtifactSeriesRef,
  type FileRef,
  type ReportRef,
  type RestoreArtifactResult,
} from '@harness/agent-protocol';
import { createClientId } from './client-id.js';
import type { ClientContext } from './types.js';

export function createArtifactsApi(ctx: ClientContext) {
  async function getArtifactSeries(seriesId: string): Promise<ArtifactSeriesRef> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/artifacts/series/${encodeURIComponent(seriesId)}`,
    );
    return artifactSeriesRefSchema.parse(await ctx.parseResponse(response));
  }

  async function restoreArtifact(
    artifactId: string,
    expectedCurrentArtifactId: string,
  ): Promise<RestoreArtifactResult> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/artifacts/${encodeURIComponent(artifactId)}/restore`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedCurrentArtifactId,
          idempotencyKey: createClientId(),
        }),
      },
    );
    return restoreArtifactResultSchema.parse(await ctx.parseResponse(response));
  }

  async function getArtifact(artifactId: string, signal?: AbortSignal): Promise<ArtifactRef> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/artifacts/${artifactId}`, {
      signal,
    });
    return artifactRefSchema.parse(await ctx.parseResponse(response));
  }

  async function getReport(
    reportId: string,
    signal?: AbortSignal,
  ): Promise<{ report: ReportRef; artifact: ArtifactRef; file: FileRef }> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/artifacts/reports/${encodeURIComponent(reportId)}`,
      { signal },
    );
    const data = (await ctx.parseResponse(response)) as {
      report: unknown;
      artifact: unknown;
      file: unknown;
    };
    return {
      report: reportRefSchema.parse(data.report),
      artifact: artifactRefSchema.parse(data.artifact),
      file: fileRefSchema.parse(data.file),
    };
  }

  async function getReportForArtifact(
    artifactId: string,
    signal?: AbortSignal,
  ): Promise<{ report: ReportRef; artifact: ArtifactRef; file: FileRef }> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/artifacts/${encodeURIComponent(artifactId)}/report`,
      { signal },
    );
    const data = (await ctx.parseResponse(response)) as {
      report: unknown;
      artifact: unknown;
      file: unknown;
    };
    return {
      report: reportRefSchema.parse(data.report),
      artifact: artifactRefSchema.parse(data.artifact),
      file: fileRefSchema.parse(data.file),
    };
  }

  async function deleteReport(reportId: string): Promise<{ deletedReportId: string }> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/artifacts/reports/${encodeURIComponent(reportId)}`,
      { method: 'DELETE' },
    );
    const data = (await ctx.parseResponse(response)) as { deletedReportId?: unknown };
    return { deletedReportId: String(data.deletedReportId) };
  }

  async function getArtifactPreview(
    artifactId: string,
    signal?: AbortSignal,
  ): Promise<{ artifactId: string; content: string; contentType: string }> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/artifacts/${artifactId}/preview`,
      { signal },
    );
    const content = await response.text();
    if (!response.ok) throw new Error(content || '文件预览不可用。');
    return {
      artifactId,
      content,
      contentType: response.headers.get('content-type') ?? 'text/plain',
    };
  }

  function getArtifactPreviewUrl(artifactId: string): string {
    return `${ctx.baseUrl}/api/agent/artifacts/${encodeURIComponent(artifactId)}/preview`;
  }

  function getArtifactDownloadUrl(artifactId: string): string {
    return `${ctx.baseUrl}/api/agent/artifacts/${encodeURIComponent(artifactId)}/download`;
  }

  function downloadArtifact(artifactId: string): void {
    const anchor = document.createElement('a');
    anchor.href = getArtifactDownloadUrl(artifactId);
    anchor.download = '';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  async function loadArtifactPreviewImageObjectUrl(
    artifactId: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await ctx.apiFetch(getArtifactPreviewUrl(artifactId), { signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || '图片预览不可用。');
    }
    const blob = await response.blob();
    if (blob.size === 0) throw new Error('图片预览不可用。');
    return URL.createObjectURL(blob);
  }

  async function deleteArtifact(
    artifactId: string,
  ): Promise<{ deletedArtifactId: string; deletedFileId: string }> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/artifacts/${artifactId}`, {
      method: 'DELETE',
    });
    const data = await ctx.parseResponse(response);
    return {
      deletedArtifactId: String((data as { deletedArtifactId?: unknown }).deletedArtifactId),
      deletedFileId: String((data as { deletedFileId?: unknown }).deletedFileId),
    };
  }

  return {
    getArtifactSeries,
    restoreArtifact,
    getArtifact,
    getReport,
    getReportForArtifact,
    deleteReport,
    getArtifactPreview,
    getArtifactPreviewUrl,
    getArtifactDownloadUrl,
    downloadArtifact,
    loadArtifactPreviewImageObjectUrl,
    deleteArtifact,
  };
}
