import { z } from 'zod';

export const mcpServerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/);

export const mcpTransportSchema = z.enum(['streamable_http']);

export const mcpDefaultApprovalSchema = z.enum(['auto_execute', 'require_approval']);

export const mcpServerStatusSchema = z.enum(['connected', 'degraded', 'disconnected']);

export const mcpSecretKindSchema = z.enum(['header', 'env', 'bearer']);

export const mcpSecretInputSchema = z.object({
  kind: mcpSecretKindSchema,
  name: z.string().trim().min(1).max(128),
  value: z.string().min(1).max(8192),
});

export const mcpSecretsConfiguredSchema = z.object({
  headerNames: z.array(z.string().min(1)),
  envKeys: z.array(z.string().min(1)),
});

export const mcpServerConfigBodySchema = z
  .object({
    serverName: mcpServerNameSchema,
    enabled: z.boolean().default(true),
    url: z.string().url(),
    headersPlain: z.record(z.string()).default({}),
    startupTimeoutMs: z.number().int().positive().max(120_000).default(30_000),
    toolCallTimeoutMs: z.number().int().positive().max(600_000).default(60_000),
    required: z.boolean().default(false),
    failOnStartupError: z.boolean().default(false),
    defaultApproval: mcpDefaultApprovalSchema.default('require_approval'),
    enabledTools: z.array(z.string().min(1)).max(256).optional(),
    disabledTools: z.array(z.string().min(1)).max(256).optional(),
    maxInstructionBytes: z.number().int().positive().max(262_144).default(32_768),
    reconnectEnabled: z.boolean().default(true),
    reconnectMaxAttempts: z.number().int().nonnegative().max(100).default(5),
    secrets: z.array(mcpSecretInputSchema).max(32).optional(),
  })
  .strict();

export const mcpCreateServerRequestSchema = mcpServerConfigBodySchema;

export const mcpUpdateServerRequestSchema = mcpServerConfigBodySchema.partial().extend({
  serverName: mcpServerNameSchema.optional(),
});

export const mcpPatchServerRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultApproval: mcpDefaultApprovalSchema.optional(),
    required: z.boolean().optional(),
    enabledTools: z.array(z.string().min(1)).max(256).nullable().optional(),
    disabledTools: z.array(z.string().min(1)).max(256).nullable().optional(),
  })
  .strict();

export const mcpServerViewSchema = z.object({
  id: z.string().min(1),
  serverName: mcpServerNameSchema,
  enabled: z.boolean(),
  transport: mcpTransportSchema,
  url: z.string().url(),
  headersPlain: z.record(z.string()),
  startupTimeoutMs: z.number().int().positive(),
  toolCallTimeoutMs: z.number().int().positive(),
  required: z.boolean(),
  failOnStartupError: z.boolean(),
  defaultApproval: mcpDefaultApprovalSchema,
  enabledTools: z.array(z.string().min(1)).nullable(),
  disabledTools: z.array(z.string().min(1)).nullable(),
  maxInstructionBytes: z.number().int().positive(),
  reconnectEnabled: z.boolean(),
  reconnectMaxAttempts: z.number().int().nonnegative(),
  status: mcpServerStatusSchema,
  /** @deprecated 与 toolCountExposed 相同；保留以兼容旧客户端 */
  toolCount: z.number().int().nonnegative(),
  toolCountExposed: z.number().int().nonnegative(),
  toolCountTotal: z.number().int().nonnegative(),
  catalogGeneration: z.number().int().nonnegative().optional(),
  lastError: z.string().min(1).nullable(),
  secretsConfigured: mcpSecretsConfiguredSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const mcpServerListResponseSchema = z.object({
  servers: z.array(mcpServerViewSchema),
  catalogGeneration: z.number().int().nonnegative(),
});

export const mcpServerTestResponseSchema = z.object({
  ok: z.boolean(),
  toolNames: z.array(z.string().min(1)),
  error: z.string().min(1).nullable(),
});

export type McpCreateServerRequest = z.infer<typeof mcpCreateServerRequestSchema>;
export type McpUpdateServerRequest = z.infer<typeof mcpUpdateServerRequestSchema>;
export type McpPatchServerRequest = z.infer<typeof mcpPatchServerRequestSchema>;
export type McpServerView = z.infer<typeof mcpServerViewSchema>;
export type McpServerListResponse = z.infer<typeof mcpServerListResponseSchema>;
export type McpServerTestResponse = z.infer<typeof mcpServerTestResponseSchema>;
export type McpSecretInput = z.infer<typeof mcpSecretInputSchema>;
