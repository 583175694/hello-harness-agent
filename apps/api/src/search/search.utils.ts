import type { SearchResult } from '@harness/agent-protocol';
import { SEARCH_LIMITS } from './search.constants';

// 清理供应商文本字段并限制进入模型上下文的数据长度。
function cleanText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

// 过滤不安全或不完整的结果，并生成稳定的网页线索结构。
export function normalizeSearchResult(
  value: { title?: unknown; url?: unknown; snippet?: unknown; publishedAt?: unknown; source?: unknown },
  index: number,
): SearchResult | undefined {
  if (typeof value.url !== 'string') return undefined;
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  url.hash = '';
  const title = cleanText(value.title, SEARCH_LIMITS.titleMaxLength);
  if (!title) return undefined;
  const normalizedUrl = url.toString();
  const publishedAt = cleanText(value.publishedAt, SEARCH_LIMITS.publishedAtMaxLength);
  const source = cleanText(value.source, SEARCH_LIMITS.sourceMaxLength);
  return {
    id: `result-${index}-${Buffer.from(normalizedUrl).toString('base64url').slice(0, SEARCH_LIMITS.resultIdHashLength)}`,
    title,
    url: normalizedUrl,
    domain: url.hostname.replace(/^www\./, ''),
    snippet: cleanText(value.snippet, SEARCH_LIMITS.snippetMaxLength),
    ...(publishedAt ? { publishedAt } : {}),
    ...(source ? { source } : {}),
  };
}
