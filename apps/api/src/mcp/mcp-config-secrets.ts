import type { McpSecretInput } from '@harness/agent-protocol';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
]);

export type PartitionedMcpHeaders = {
  headersPlain: Record<string, string>;
  secrets: McpSecretInput[];
};

export function partitionMcpHeaders(headers: Record<string, string>): PartitionedMcpHeaders {
  const headersPlain: Record<string, string> = {};
  const secrets: McpSecretInput[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const lower = key.toLowerCase();
    if (lower === 'authorization') {
      const bearer = value.match(/^Bearer\s+(.+)$/i);
      secrets.push({
        kind: 'bearer',
        name: 'Authorization',
        value: bearer ? bearer[1]! : value,
      });
      continue;
    }
    if (SENSITIVE_HEADER_NAMES.has(lower)) {
      secrets.push({ kind: 'header', name: key, value });
      continue;
    }
    headersPlain[key] = value;
  }
  return { headersPlain, secrets };
}

/** 模型上下文与 Tool 返回值：隐藏 header 中的密钥。 */
export function redactMcpHeadersForDisplay(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lower) || lower === 'authorization') {
      out[key] = '[REDACTED]';
    } else {
      out[key] = value;
    }
  }
  return out;
}
