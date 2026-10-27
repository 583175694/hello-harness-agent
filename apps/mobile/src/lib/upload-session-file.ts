import { ApiProblem } from '@harness/agent-client';
import { fileRefSchema, problemDetailsSchema, type FileRef } from '@harness/agent-protocol';
import { File, UploadType } from 'expo-file-system';
import {
  getInfoAsync,
  uploadAsync as legacyUploadAsync,
  FileSystemUploadType,
} from 'expo-file-system/legacy';

import { getMobileAuthHeaders } from './mobile-auth-api';

export type LocalFilePayload = {
  uri: string;
  name: string;
  mimeType: string;
};

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function sessionFilesUrl(baseUrl: string, sessionId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/agent/sessions/${sessionId}/files`;
}

function parseUploadResponse(status: number, body: string): FileRef {
  let data: unknown;
  try {
    data = JSON.parse(body) as unknown;
  } catch {
    throw new Error(body || `上传失败（HTTP ${status}）`);
  }
  if (status < 200 || status >= 300) {
    try {
      throw new ApiProblem(problemDetailsSchema.parse(data));
    } catch (error) {
      if (error instanceof ApiProblem) throw error;
      throw new Error(`上传失败（HTTP ${status}）`);
    }
  }
  return fileRefSchema.parse(data);
}

async function assertReadableFileUri(uri: string): Promise<void> {
  const info = await getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('无法读取本地文件，请重新选择。');
  }
  if ('size' in info && typeof info.size === 'number' && info.size <= 0) {
    throw new Error('文件为空。');
  }
}

async function uploadAuthHeaders(): Promise<Record<string, string>> {
  return getMobileAuthHeaders();
}

export async function uploadSessionTextFile(
  baseUrl: string,
  sessionId: string,
  text: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<FileRef> {
  const form = new FormData();
  form.append('file', {
    uri: `data:text/plain;base64,${encodeUtf8Base64(text)}`,
    name: fileName,
    type: 'text/plain',
  } as unknown as Blob);

  const response = await fetch(sessionFilesUrl(baseUrl, sessionId), {
    method: 'POST',
    body: form,
    headers: await uploadAuthHeaders(),
    signal,
  });

  const data: unknown = await response.json();
  if (!response.ok) {
    throw new ApiProblem(problemDetailsSchema.parse(data));
  }
  return fileRefSchema.parse(data);
}

async function uploadSessionFileFromUriFetch(
  baseUrl: string,
  sessionId: string,
  local: LocalFilePayload,
  signal?: AbortSignal,
): Promise<FileRef> {
  const form = new FormData();
  form.append('file', {
    uri: local.uri,
    name: local.name,
    type: local.mimeType,
  } as unknown as Blob);

  const response = await fetch(sessionFilesUrl(baseUrl, sessionId), {
    method: 'POST',
    body: form,
    headers: await uploadAuthHeaders(),
    signal,
  });

  const body = await response.text();
  return parseUploadResponse(response.status, body);
}

async function uploadSessionFileFromUriLegacy(
  baseUrl: string,
  sessionId: string,
  local: LocalFilePayload,
): Promise<FileRef> {
  const result = await legacyUploadAsync(sessionFilesUrl(baseUrl, sessionId), local.uri, {
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: local.mimeType,
    httpMethod: 'POST',
    headers: await uploadAuthHeaders(),
  });
  return parseUploadResponse(result.status, result.body);
}

async function uploadSessionFileFromUriModern(
  baseUrl: string,
  sessionId: string,
  local: LocalFilePayload,
  signal?: AbortSignal,
): Promise<FileRef> {
  const file = new File(local.uri);
  const result = await file.upload(sessionFilesUrl(baseUrl, sessionId), {
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType: local.mimeType,
    httpMethod: 'POST',
    signal,
    headers: await uploadAuthHeaders(),
  });
  return parseUploadResponse(result.status, result.body);
}

/** iOS 上 legacy multipart 通常比 RN FormData / 新 File API 更稳，失败时再换路径。 */
export async function uploadSessionFileFromUri(
  baseUrl: string,
  sessionId: string,
  local: LocalFilePayload,
  signal?: AbortSignal,
): Promise<FileRef> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  await assertReadableFileUri(local.uri);

  try {
    return await uploadSessionFileFromUriFetch(baseUrl, sessionId, local, signal);
  } catch (fetchError) {
    if ((fetchError as Error).name === 'AbortError') throw fetchError;
    try {
      return await uploadSessionFileFromUriLegacy(baseUrl, sessionId, local);
    } catch (legacyError) {
      if ((legacyError as Error).name === 'AbortError') throw legacyError;
      try {
        return await uploadSessionFileFromUriModern(baseUrl, sessionId, local, signal);
      } catch (modernError) {
        if ((modernError as Error).name === 'AbortError') throw modernError;
        throw fetchError instanceof Error ? fetchError : legacyError;
      }
    }
  }
}
