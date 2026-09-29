/** 将 MCP / 工具返回文本解析为 JSON；失败时包一层便于 JsonViewer 展示。 */
export function parseJsonPreviewText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { _unparsed: trimmed };
  }
}
