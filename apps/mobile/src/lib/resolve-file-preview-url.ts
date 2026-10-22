import type { FileRef } from '@harness/agent-protocol';

export function resolveAgentFilePreviewUrl(apiBaseUrl: string, fileId: string): string {
  return `${apiBaseUrl.replace(/\/$/, '')}/api/agent/files/${fileId}/preview`;
}

export function resolveUserAttachmentImageUri(
  attachment: FileRef,
  apiBaseUrl: string,
): string | undefined {
  if (attachment.previewUrl) return attachment.previewUrl;
  const isImage =
    attachment.fileKind === 'image' || attachment.mediaType.toLowerCase().startsWith('image/');
  if (!isImage || attachment.status !== 'ready') return undefined;
  return resolveAgentFilePreviewUrl(apiBaseUrl, attachment.fileId);
}
