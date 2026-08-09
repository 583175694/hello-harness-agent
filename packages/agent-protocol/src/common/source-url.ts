const TRACKING_PARAMETERS = new Set(['gclid', 'fbclid', 'msclkid']);

// 为预算、去重和最终来源匹配生成跨前后端一致的公开 URL key。
export function normalizeSourceUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith('utm_') || TRACKING_PARAMETERS.has(normalized)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return rawUrl;
  }
}
