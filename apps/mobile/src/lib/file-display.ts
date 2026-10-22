/** 与 Web `conversation.tsx` 文件卡片展示逻辑对齐。 */

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtensionLabel(fileName: string): string {
  return (fileName.split('.').pop() ?? 'FILE').toUpperCase();
}

export function splitFileName(fileName: string): { prefix: string; suffix: string } {
  const dot = fileName.lastIndexOf('.');
  return dot > 0
    ? { prefix: fileName.slice(0, dot), suffix: fileName.slice(dot) }
    : { prefix: fileName, suffix: '' };
}

/** Web `.file-card-icon--*` 背景色（RN 用 inline backgroundColor）。 */
export function fileCardIconColors(extension: string): {
  backgroundColor: string;
  labelColor: string;
} {
  const ext = extension.toLowerCase();
  if (['xlsx', 'xls'].includes(ext)) {
    return { backgroundColor: '#20ad5b', labelColor: '#ffffff' };
  }
  if (['doc', 'docx'].includes(ext)) {
    return { backgroundColor: '#1677ff', labelColor: '#ffffff' };
  }
  if (ext === 'pdf') {
    return { backgroundColor: '#ff4d4f', labelColor: '#ffffff' };
  }
  if (['ppt', 'pptx'].includes(ext)) {
    return { backgroundColor: '#ff6e31', labelColor: '#ffffff' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { backgroundColor: '#fab714', labelColor: '#ffffff' };
  }
  if (['txt', 'md', 'markdown', 'html', 'csv', 'json'].includes(ext)) {
    return { backgroundColor: '#8c8c8c', labelColor: '#ffffff' };
  }
  return { backgroundColor: '#8c8c8c', labelColor: '#ffffff' };
}
