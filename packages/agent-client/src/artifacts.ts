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

  /**
   * 将已交付的 HTML 演示稿直接导出为 PPTX，并用浏览器下载。
   *
   * 走 POST 而不是 <a href>，因为导出可能需要数十秒；同时把服务端失败原因
   * 抛回调用方展示，避免用户只看到“下载失败”却不知道为什么。
   */
  async function exportArtifactPptx(artifactId: string): Promise<void> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/artifacts/${encodeURIComponent(artifactId)}/export-pptx`,
      { method: 'POST' },
    );
    if (!response.ok) {
      const detail = await readProblemDetail(response);
      throw new Error(detail || 'PPTX 导出失败，请稍后重试。');
    }
    const blob = await response.blob();
    if (blob.size === 0) throw new Error('导出结果为空，请稍后重试。');
    const fileName =
      fileNameFromDisposition(response.headers.get('content-disposition')) ?? 'presentation.pptx';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function readProblemDetail(response: Response): Promise<string | undefined> {
    try {
      const data: unknown = await response.json();
      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === 'string') return detail;
      }
    } catch {
      // 非 JSON 错误体按通用文案处理。
    }
    return undefined;
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
    exportArtifactPptx,
    loadArtifactPreviewImageObjectUrl,
    deleteArtifact,
  };
}

/** 兼容 RFC 5987 的 filename* 与普通 filename。 */
function fileNameFromDisposition(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      // 非法编码回退到普通 filename。
    }
  }
  const plain = /filename="?([^";]+)"?/iu.exec(disposition)?.[1];
  return plain?.trim();
}
