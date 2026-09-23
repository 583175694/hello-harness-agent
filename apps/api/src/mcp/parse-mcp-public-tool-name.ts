import { MCP_PUBLIC_NAME_PREFIX, isMcpPublicToolName } from './mcp.types';

export type ParsedMcpPublicToolName = {
  serverName: string;
  rawName: string;
};

export function parseMcpPublicToolName(name: string): ParsedMcpPublicToolName | null {
  if (!isMcpPublicToolName(name)) return null;
  const rest = name.slice(MCP_PUBLIC_NAME_PREFIX.length);
  const separator = rest.indexOf('__');
  if (separator <= 0) return null;
  const serverName = rest.slice(0, separator);
  const rawName = rest.slice(separator + 2);
  if (!serverName.length || !rawName.length) return null;
  return { serverName, rawName };
}
