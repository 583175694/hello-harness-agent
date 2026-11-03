/** 上传完成后本地预览 URI，供会话气泡在鉴权 preview URL 不可用时回退。 */
const previewByFileId = new Map<string, string>();

export function rememberComposerAttachmentPreview(fileId: string, previewUri: string): void {
  if (!fileId || !previewUri) return;
  previewByFileId.set(fileId, previewUri);
}

export function resolveCachedComposerAttachmentPreview(fileId: string): string | undefined {
  return previewByFileId.get(fileId);
}

export function clearComposerAttachmentPreviewCache(): void {
  previewByFileId.clear();
}
