import {
  mcpServerIconFallbackSrc,
  parseMcpPublicToolName,
  resolveMcpToolIconSrc,
} from '@harness/agent-protocol';

import type { RunMcpSnapshot } from './mcp.types';
import { isMcpPublicToolName } from './mcp.types';

export function mcpIconSrcFromSnapshot(
  publicName: string,
  snapshot: RunMcpSnapshot | undefined,
): string | undefined {
  if (!snapshot || !isMcpPublicToolName(publicName)) return undefined;
  const entry = snapshot.entries.find((item) => item.publicName === publicName);
  const serverIcons = entry
    ? snapshot.serverIcons.find((item) => item.serverName === entry.serverName)?.icons
    : undefined;
  const fromWire = resolveMcpToolIconSrc(entry, serverIcons);
  if (fromWire) return fromWire;
  const parsed = parseMcpPublicToolName(publicName);
  return parsed ? mcpServerIconFallbackSrc(parsed.serverName) : undefined;
}
