import { createHash } from 'node:crypto';
import { MCP_PUBLIC_NAME_PREFIX } from './mcp.types';

const MAX_PUBLIC_NAME_LENGTH = 128;

export function publicToolName(serverName: string, rawName: string): string {
  const base = `${MCP_PUBLIC_NAME_PREFIX}${normalizeSegment(serverName)}__${normalizeSegment(rawName)}`;
  if (base.length <= MAX_PUBLIC_NAME_LENGTH) return base;
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, 8);
  const head = base.slice(0, MAX_PUBLIC_NAME_LENGTH - 9);
  return `${head}_${hash}`;
}

function normalizeSegment(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_-]/g, '_');
  return normalized.length ? normalized : '_';
}
