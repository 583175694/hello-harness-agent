const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

/** CoT / 设置页：将 MCP iconSrc 转为浏览器可加载的 URL（https 走同源代理）。 */
export function mcpIconDisplayUrl(iconSrc: string | undefined): string | undefined {
  if (!iconSrc?.trim()) return undefined;
  const trimmed = iconSrc.trim();
  if (/^data:image\/(png|jpeg|jpg);base64,/i.test(trimmed)) return trimmed;
  if (/^https:\/\//i.test(trimmed)) {
    return `${apiBaseUrl}/api/agent/mcp/icon?src=${encodeURIComponent(trimmed)}`;
  }
  return undefined;
}
