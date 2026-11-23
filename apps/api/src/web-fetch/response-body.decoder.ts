// 按响应头与 HTML meta 声明解码原始字节，减轻境内站点 charset 缺失时的乱码。
export function decodeResponseBody(
  body: Buffer,
  headerMime?: string,
  headerCharset?: string,
): string {
  const mime = (headerMime ?? '').toLowerCase();
  const isHtml = mime.includes('text/html') || mime.includes('application/xhtml+xml');
  let label = normalizeDecoderLabel(headerCharset);
  if (isHtml || !label) {
    const sniffed = sniffHtmlCharset(body);
    if (sniffed) label = sniffed;
  }
  if (!label) label = 'utf-8';
  try {
    return new TextDecoder(label, { fatal: false }).decode(body);
  } catch {
    return body.toString('utf8');
  }
}

function sniffHtmlCharset(body: Buffer): string | undefined {
  const sample = body.subarray(0, Math.min(body.byteLength, 8192)).toString('latin1');
  const httpEquiv = /http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset=([\w-]+)/i.exec(
    sample,
  );
  if (httpEquiv?.[1]) return normalizeDecoderLabel(httpEquiv[1]);
  const meta = /charset\s*=\s*["']?([\w-]+)/i.exec(sample);
  if (meta?.[1]) return normalizeDecoderLabel(meta[1]);
  return undefined;
}

function normalizeDecoderLabel(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const lowered = raw.trim().toLowerCase().replace(/["']/g, '');
  if (lowered === 'gb2312' || lowered === 'gb_2312') return 'gbk';
  if (lowered === 'gb18030') return 'gb18030';
  if (lowered === 'utf8') return 'utf-8';
  return lowered;
}