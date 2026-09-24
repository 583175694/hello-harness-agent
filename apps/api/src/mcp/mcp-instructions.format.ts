import type { McpServerInstructionSnapshot } from './mcp.types';

export const MCP_INSTRUCTIONS_GLOBAL_MAX_BYTES = 65_536;

function truncateUtf8Bytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && (buf[end - 1]! & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, end).toString('utf8');
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** 将 Run 快照内的 MCP instructions 格式化为可追加到 system 的文本。 */
export function formatMcpInstructionsBlock(
  snapshots: ReadonlyArray<McpServerInstructionSnapshot>,
  globalMaxBytes: number = MCP_INSTRUCTIONS_GLOBAL_MAX_BYTES,
): string {
  if (!snapshots.length) return '';
  const parts: string[] = [];
  let budget = globalMaxBytes;
  for (const snap of snapshots) {
    const raw = snap.text.trim();
    if (!raw || budget <= 0) continue;
    const perServerCap = Math.min(snap.maxInstructionBytes, budget);
    const body = truncateUtf8Bytes(raw, perServerCap);
    if (!body) continue;
    const block = `<mcp_instructions server="${escapeXmlAttr(snap.serverName)}">${body}</mcp_instructions>`;
    const blockBytes = Buffer.byteLength(block, 'utf8');
    if (blockBytes > budget) {
      const trimmedBody = truncateUtf8Bytes(body, Math.max(0, budget - 64));
      if (!trimmedBody) break;
      parts.push(
        `<mcp_instructions server="${escapeXmlAttr(snap.serverName)}">${trimmedBody}</mcp_instructions>`,
      );
      break;
    }
    parts.push(block);
    budget -= blockBytes;
  }
  return parts.join('\n');
}
