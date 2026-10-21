export type McpServerFixture = {
  id: string;
  serverName: string;
  status: 'connected' | 'degraded' | 'disconnected';
  url: string;
  enabled: boolean;
  headersPlain: Record<string, string>;
  startupTimeoutMs: number;
  toolCallTimeoutMs: number;
  required: boolean;
  failOnStartupError: boolean;
  defaultApproval: 'auto' | 'manual';
  maxInstructionBytes: number;
  reconnectEnabled: boolean;
  reconnectMaxAttempts: number;
};

export const mcpServerFixtures: McpServerFixture[] = [
  {
    id: 'filesystem-local',
    serverName: 'filesystem-local',
    status: 'connected',
    url: 'stdio://local-fs',
    enabled: true,
    headersPlain: {},
    startupTimeoutMs: 10_000,
    toolCallTimeoutMs: 60_000,
    required: false,
    failOnStartupError: true,
    defaultApproval: 'manual',
    maxInstructionBytes: 32_768,
    reconnectEnabled: true,
    reconnectMaxAttempts: 3,
  },
  {
    id: 'web-search',
    serverName: 'web-search',
    status: 'degraded',
    url: 'https://mcp.example/search',
    enabled: true,
    headersPlain: { Authorization: 'Bearer demo' },
    startupTimeoutMs: 15_000,
    toolCallTimeoutMs: 120_000,
    required: false,
    failOnStartupError: false,
    defaultApproval: 'auto',
    maxInstructionBytes: 16_384,
    reconnectEnabled: true,
    reconnectMaxAttempts: 5,
  },
  {
    id: 'postgres-readonly',
    serverName: 'postgres-readonly',
    status: 'disconnected',
    url: 'https://mcp.example/pg',
    enabled: false,
    headersPlain: {},
    startupTimeoutMs: 20_000,
    toolCallTimeoutMs: 90_000,
    required: true,
    failOnStartupError: true,
    defaultApproval: 'manual',
    maxInstructionBytes: 8192,
    reconnectEnabled: false,
    reconnectMaxAttempts: 1,
  },
];

export function defaultMcpForm(): Omit<McpServerFixture, 'id' | 'status'> {
  return {
    serverName: '',
    url: '',
    enabled: true,
    headersPlain: {},
    startupTimeoutMs: 10_000,
    toolCallTimeoutMs: 60_000,
    required: false,
    failOnStartupError: true,
    defaultApproval: 'manual',
    maxInstructionBytes: 32_768,
    reconnectEnabled: true,
    reconnectMaxAttempts: 3,
  };
}
