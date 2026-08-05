import type { SearchResult } from '@harness/agent-protocol';

const TITLE_LIMIT = 240;
const SNIPPET_LIMIT = 800;

function cleanText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

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
  const title = cleanText(value.title, TITLE_LIMIT);
  if (!title) return undefined;
  const normalizedUrl = url.toString();
  const publishedAt = cleanText(value.publishedAt, 80);
  const source = cleanText(value.source, 160);
  return {
    id: `result-${index}-${Buffer.from(normalizedUrl).toString('base64url').slice(0, 16)}`,
    title,
    url: normalizedUrl,
    domain: url.hostname.replace(/^www\./, ''),
    snippet: cleanText(value.snippet, SNIPPET_LIMIT),
    ...(publishedAt ? { publishedAt } : {}),
    ...(source ? { source } : {}),
  };
}

export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`SearchProviderHttpError:${response.status}`);
  return response.json();
}
