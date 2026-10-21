import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

function isPrivateOrLocalIp(host: string): boolean {
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 0) return true;
    return false;
  }
  if (ipVersion === 6) {
    const lower = host.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
  }
  return false;
}

/** Agent 添加 MCP 时的 URL 策略：仅 HTTPS，且禁止本机/私网目标（SSRF 防护）。 */
export function assertAgentMcpHttpsUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('MCP URL 无效。');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Agent 添加 MCP 仅支持 https URL。');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL 中不得包含用户名或密码，请改用 headers 或 Settings。');
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    throw new Error('不允许连接 localhost 类主机。');
  }
  if (isPrivateOrLocalIp(host)) {
    throw new Error('不允许连接私网或本机地址。');
  }
  return parsed;
}

/** 工具结果与日志用：脱敏 URL query 中的 token/key/secret 等参数。 */
export function redactMcpUrlForDisplay(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const sensitive = new Set(['token', 'key', 'secret', 'api_key', 'apikey', 'access_token']);
    for (const [name] of [...parsed.searchParams.entries()]) {
      if (sensitive.has(name.toLowerCase())) {
        parsed.searchParams.set(name, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function normalizeMcpUrlForCompare(rawUrl: string): string {
  const parsed = assertAgentMcpHttpsUrl(rawUrl);
  parsed.hash = '';
  if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }
  return parsed.toString();
}
