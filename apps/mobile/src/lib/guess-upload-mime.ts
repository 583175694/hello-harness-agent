/** 与 API `normalizeMediaType` 在 octet-stream 分支的扩展名映射保持一致。 */
const EXT_TO_MIME: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** iOS / 文档选择器常见的非标准 MIME，归一化后再做白名单校验。 */
const MIME_ALIASES: Record<string, string> = {
  'text/x-markdown': 'text/markdown',
  'text/x-web-markdown': 'text/markdown',
  'application/x-md': 'text/markdown',
  'text/comma-separated-values': 'text/csv',
  'application/x-json': 'application/json',
  'image/jpg': 'image/jpeg',
};

function baseMimeType(reported?: string | null): string {
  const raw = (reported ?? '').trim().toLowerCase();
  if (!raw) return '';
  return raw.split(';')[0]?.trim() ?? '';
}

function extensionFromFileName(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** 缓存 URI 可能丢扩展名，从路径补全。 */
export function inferUploadFileName(name: string, uri?: string): string {
  if (extensionFromFileName(name)) return name;
  if (!uri) return name;
  const path = uri.split('?')[0] ?? uri;
  const segment = path.split('/').pop() ?? '';
  const ext = extensionFromFileName(segment);
  if (!ext) return name;
  const stem = name.includes('.') ? name.replace(/\.[^.]+$/, '') : name;
  return `${stem || 'upload'}.${ext}`;
}

export function guessUploadMimeType(fileName: string, reportedMime?: string | null): string {
  const ext = extensionFromFileName(fileName);
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';

  let mime = baseMimeType(reportedMime);
  if (mime) {
    mime = MIME_ALIASES[mime] ?? mime;
    if (mime === 'text/plain' && (ext === 'md' || ext === 'markdown')) return 'text/markdown';
    if (mime !== 'application/octet-stream') return mime;
  }

  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

export function isSupportedUploadMime(mimeType: string): boolean {
  const normalized = MIME_ALIASES[baseMimeType(mimeType)] ?? baseMimeType(mimeType);
  const allowed = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]);
  return allowed.has(normalized);
}
