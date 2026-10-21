import { z } from 'zod';

import { AGENT_PROTOCOL_LIMITS } from '../common/constants.js';

export const externalToolSubKindSchema = z.enum(['mcp', 'unknown']);

export const externalToolInputSchema = z.record(z.unknown()).optional();

export const externalToolResultSchema = z.object({
  preview: z.string(),
  charCount: z.number().int().nonnegative().optional(),
  truncated: z.boolean().optional(),
});

export const externalToolStartedPayloadSchema = z.object({
  publicName: z.string().min(1),
  subKind: externalToolSubKindSchema,
  input: externalToolInputSchema,
});

export const externalToolCompletedPayloadSchema = z.object({
  publicName: z.string().min(1),
  subKind: externalToolSubKindSchema,
  result: externalToolResultSchema,
});

export const externalToolOutputPreviewSchema = z
  .string()
  .max(AGENT_PROTOCOL_LIMITS.externalToolOutputPreviewMax);
