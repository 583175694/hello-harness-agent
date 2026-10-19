import type { McpToolCatalogEntry } from '../../mcp/mcp.types';

const BM25_K1 = 1.2;
const BM25_B = 0.75;

export type ToolSearchHit = {
  entry: McpToolCatalogEntry;
  score: number;
};

export type ToolSearchFallbackItem = {
  name: string;
  description: string;
  serverName: string;
};

export class DeferredToolSearchIndex {
  private readonly docs: Array<{ entry: McpToolCatalogEntry; tokens: string[]; length: number }>;
  private readonly avgDocLength: number;
  private readonly df = new Map<string, number>();

  constructor(entries: ReadonlyArray<McpToolCatalogEntry>) {
    this.docs = entries.map((entry) => {
      const tokens = tokenize(buildIndexText(entry));
      return { entry, tokens, length: tokens.length };
    });
    const totalLen = this.docs.reduce((sum, doc) => sum + doc.length, 0);
    this.avgDocLength = this.docs.length ? totalLen / this.docs.length : 0;
    for (const doc of this.docs) {
      const seen = new Set(doc.tokens);
      for (const term of seen) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
    }
  }

  search(query: string, limit: number): ToolSearchHit[] {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const exact = this.docs.find(
      (doc) =>
        doc.entry.publicName.toLowerCase() === normalizedQuery.toLowerCase() ||
        doc.entry.rawName.toLowerCase() === normalizedQuery.toLowerCase(),
    );

    const queryTokens = tokenize(normalizedQuery);
    const scored: ToolSearchHit[] = [];
    for (const doc of this.docs) {
      const score = this.scoreDocument(queryTokens, doc.tokens, doc.length);
      if (score > 0) scored.push({ entry: doc.entry, score });
    }
    scored.sort((a, b) => b.score - a.score);

    const top: ToolSearchHit[] = [];
    if (exact) {
      top.push({ entry: exact.entry, score: Number.POSITIVE_INFINITY });
    }
    for (const hit of scored) {
      if (exact && hit.entry.publicName === exact.entry.publicName) continue;
      top.push(hit);
      if (top.length >= limit) break;
    }
    return top.slice(0, limit);
  }

  /** BM25 零结果时按 server 分组返回 name + 一行描述（无 parameters）。 */
  fallbackListing(): ToolSearchFallbackItem[] {
    const byServer = new Map<string, ToolSearchFallbackItem[]>();
    for (const doc of this.docs) {
      const list = byServer.get(doc.entry.serverName) ?? [];
      list.push({
        name: doc.entry.publicName,
        description: doc.entry.description.slice(0, 200),
        serverName: doc.entry.serverName,
      });
      byServer.set(doc.entry.serverName, list);
    }
    return [...byServer.values()].flat();
  }

  get size(): number {
    return this.docs.length;
  }

  private scoreDocument(queryTokens: string[], docTokens: string[], docLength: number): number {
    if (!queryTokens.length || !docTokens.length) return 0;
    const tf = new Map<string, number>();
    for (const token of docTokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    let score = 0;
    const n = this.docs.length;
    for (const term of queryTokens) {
      const freq = tf.get(term);
      if (!freq) continue;
      const df = this.df.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      const norm =
        (freq * (BM25_K1 + 1)) /
        (freq + BM25_K1 * (1 - BM25_B + (BM25_B * docLength) / (this.avgDocLength || 1)));
      score += idf * norm;
    }
    return score;
  }
}

export function buildIndexText(entry: McpToolCatalogEntry): string {
  const paramNames = collectParameterFieldNames(entry.parameters);
  return [
    entry.publicName,
    entry.serverName,
    entry.rawName,
    entry.description,
    ...paramNames,
  ].join(' ');
}

function collectParameterFieldNames(parameters: Record<string, unknown>): string[] {
  const names: string[] = [];
  const props = parameters.properties;
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    for (const key of Object.keys(props as Record<string, unknown>)) names.push(key);
  }
  walkSchema(parameters, names);
  return names;
}

function walkSchema(node: unknown, names: string[]): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const record = node as Record<string, unknown>;
  if (record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)) {
    for (const key of Object.keys(record.properties as Record<string, unknown>)) {
      if (!names.includes(key)) names.push(key);
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') walkSchema(value, names);
  }
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const token of text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((part) => part.length > 1)) {
    tokens.push(token);
  }
  for (const segment of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (const char of segment) tokens.push(char);
    for (let index = 0; index < segment.length - 1; index += 1) {
      tokens.push(segment[index]! + segment[index + 1]!);
    }
  }
  return tokens;
}
