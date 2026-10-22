import type {
  McpCreateServerRequest,
  McpServerView,
  McpUpdateServerRequest,
} from '@harness/agent-protocol';

type McpDefaultApproval = McpCreateServerRequest['defaultApproval'];

export type McpFormState = {
  serverName: string;
  enabled: boolean;
  url: string;
  headersPlain: Record<string, string>;
  startupTimeoutMs: number;
  toolCallTimeoutMs: number;
  required: boolean;
  failOnStartupError: boolean;
  defaultApproval: McpDefaultApproval;
  maxInstructionBytes: number;
  reconnectEnabled: boolean;
  reconnectMaxAttempts: number;
};

export function defaultMcpFormState(): McpFormState {
  return {
    serverName: '',
    enabled: true,
    url: 'https://',
    headersPlain: {},
    startupTimeoutMs: 30_000,
    toolCallTimeoutMs: 60_000,
    required: false,
    failOnStartupError: false,
    defaultApproval: 'require_approval',
    maxInstructionBytes: 32_768,
    reconnectEnabled: true,
    reconnectMaxAttempts: 5,
  };
}

export function mcpViewToForm(server: McpServerView): McpFormState {
  return {
    serverName: server.serverName,
    enabled: server.enabled,
    url: server.url,
    headersPlain: server.headersPlain,
    startupTimeoutMs: server.startupTimeoutMs,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    required: server.required,
    failOnStartupError: server.failOnStartupError,
    defaultApproval: server.defaultApproval,
    maxInstructionBytes: server.maxInstructionBytes,
    reconnectEnabled: server.reconnectEnabled,
    reconnectMaxAttempts: server.reconnectMaxAttempts,
  };
}

function optionalSecrets(token?: string) {
  const trimmed = token?.trim();
  if (!trimmed) return undefined;
  return [{ kind: 'bearer' as const, name: 'Authorization', value: trimmed }];
}

export function mcpFormToCreateRequest(form: McpFormState, token?: string): McpCreateServerRequest {
  return {
    ...form,
    secrets: optionalSecrets(token),
  };
}

export function mcpFormToUpdateRequest(form: McpFormState, token?: string): McpUpdateServerRequest {
  return {
    ...form,
    secrets: optionalSecrets(token),
  };
}
