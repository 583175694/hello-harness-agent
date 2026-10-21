export const MCP_PUBLIC_TOOL_PREFIX = 'mcp__';

export function isMcpPublicToolName(toolName: string): boolean {
  return toolName.startsWith(MCP_PUBLIC_TOOL_PREFIX);
}

export function parseMcpPublicToolName(
  name: string,
): { serverName: string; rawName: string } | null {
  if (!isMcpPublicToolName(name)) return null;
  const rest = name.slice(MCP_PUBLIC_TOOL_PREFIX.length);
  const separator = rest.indexOf('__');
  if (separator <= 0) return null;
  const serverName = rest.slice(0, separator);
  const rawName = rest.slice(separator + 2);
  if (!serverName.length || !rawName.length) return null;
  return { serverName, rawName };
}

/** 面向用户展示的 MCP 调用说明（对话内联与 Workbench，不用字符数）。 */
export function mcpToolBusinessSummary(
  publicName: string,
  input: Record<string, unknown>,
): string {
  const parsed = parseMcpPublicToolName(publicName);
  const rawName = parsed?.rawName ?? publicName;
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const purpose = typeof input.purpose === 'string' ? input.purpose.trim() : '';

  if (rawName === 'search') {
    if (query && purpose) return `${rawName} ${query}, purpose=${purpose}`;
    if (query) return `${rawName} ${query}`;
    if (purpose) return `${rawName} purpose=${purpose}`;
    return rawName;
  }
  if (rawName === 'fetch_content') {
    if (purpose) return `${rawName} ${purpose}`;
    const url = typeof input.url === 'string' ? input.url.trim() : '';
    if (url) return `${rawName} ${url.length > 96 ? `${url.slice(0, 93)}…` : url}`;
    const urls = input.urls;
    if (Array.isArray(urls) && urls.length > 0) {
      const first = urls.find((item) => typeof item === 'string' && item.trim());
      if (typeof first === 'string') {
        const trimmed = first.trim();
        return `${rawName} ${trimmed.length > 96 ? `${trimmed.slice(0, 93)}…` : trimmed}`;
      }
    }
    return rawName;
  }

  const parts: string[] = [];
  if (query) parts.push(query);
  if (purpose) parts.push(`purpose=${purpose}`);
  if (!parts.length) {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null) continue;
      const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
      if (!text) continue;
      if (key === 'url' && text.length > 96) {
        parts.push(`${key}=${text.slice(0, 93)}…`);
        continue;
      }
      parts.push(`${key}=${text.length > 120 ? `${text.slice(0, 117)}…` : text}`);
      if (parts.length >= 3) break;
    }
  }
  return parts.length ? `${rawName} ${parts.join(', ')}` : rawName;
}
