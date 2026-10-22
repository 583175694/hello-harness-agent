import { fileRefSchema, type FileRef } from '@harness/agent-protocol';
import type { ClientContext } from './types.js';

export function createFilesApi(ctx: ClientContext) {
  async function uploadFile(sessionId: string, file: File, signal?: AbortSignal): Promise<FileRef> {
    const body = new FormData();
    body.append('file', file);
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/sessions/${sessionId}/files`, {
      method: 'POST',
      body,
      signal,
    });
    return fileRefSchema.parse(await ctx.parseResponse(response));
  }

  async function getFile(fileId: string, signal?: AbortSignal): Promise<FileRef> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/files/${fileId}`, { signal });
    return fileRefSchema.parse(await ctx.parseResponse(response));
  }

  async function getFilePreview(
    fileId: string,
    signal?: AbortSignal,
  ): Promise<{ fileId: string; content: string; contentType: string }> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/files/${fileId}/preview`, {
      signal,
    });
    const content = await response.text();
    if (!response.ok) throw new Error(content || '文件预览不可用。');
    return {
      fileId,
      content,
      contentType: response.headers.get('content-type') ?? 'text/plain',
    };
  }

  async function retryFile(fileId: string): Promise<FileRef> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/files/${fileId}/retry`, {
      method: 'POST',
    });
    return fileRefSchema.parse(await ctx.parseResponse(response));
  }

  async function deleteFile(fileId: string): Promise<{ deletedFileId: string }> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/files/${fileId}`, {
      method: 'DELETE',
    });
    const data = await ctx.parseResponse(response);
    return { deletedFileId: String((data as { deletedFileId?: unknown }).deletedFileId) };
  }

  return { uploadFile, getFile, getFilePreview, retryFile, deleteFile };
}
