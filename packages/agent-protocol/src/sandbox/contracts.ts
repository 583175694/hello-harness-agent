import { z } from 'zod';
import { artifactRefSchema, fileRefSchema } from '../files/contracts.js';

export const EXECUTE_COMMAND_PUBLIC_COMMAND_MAX = 200;
export const EXECUTE_COMMAND_COMMAND_MAX = 8_000;

export function unicodeLength(value: string): number {
  return [...value].length;
}

export function summarizeCommand(
  command: string,
  max = EXECUTE_COMMAND_PUBLIC_COMMAND_MAX,
): string {
  const points = [...command];
  if (points.length <= max) return command;
  return `${points.slice(0, max).join('')}…`;
}

export function isWorkspaceRelativePath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  if (path.startsWith('/')) return false;
  const parts = path.split('/');
  if (parts.some((part) => part === '..')) return false;
  return parts.every((part) => part !== '' || path === '.' || path.endsWith('/'));
}

const workspaceRelativePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !value.includes('\0') && !value.startsWith('/') && !value.split('/').includes('..'), {
    message: 'path must be workspace-relative',
  });

export const executeCommandInputSchema = z
  .object({
    command: z
      .string()
      .min(1)
      .refine((value) => unicodeLength(value) <= EXECUTE_COMMAND_COMMAND_MAX, {
        message: `command exceeds ${EXECUTE_COMMAND_COMMAND_MAX} code points`,
      }),
    cwd: workspaceRelativePathSchema.optional(),
    timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
    inputFiles: z
      .array(
        z
          .object({
            fileId: z.string().min(1),
            path: workspaceRelativePathSchema,
          })
          .strict(),
      )
      .max(10)
      .optional(),
    output: z
      .object({
        path: workspaceRelativePathSchema,
        fileName: z.string().trim().min(1).max(255).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const executeCommandInputSummarySchema = z
  .object({
    command: z.string().min(1),
    cwd: z.string().min(1).optional(),
    timeoutMs: z.number().int().positive().optional(),
    inputFiles: z
      .array(z.object({ fileId: z.string().min(1), path: z.string().min(1) }).strict())
      .max(10)
      .optional(),
    output: z
      .object({
        path: z.string().min(1),
        fileName: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const collectionErrorSchema = z
  .object({
    code: z.string().min(1),
    detail: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();

export const executeCommandCollectionSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('collected'),
      artifact: artifactRefSchema,
      file: fileRefSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('failed'),
      error: collectionErrorSchema,
    })
    .strict(),
]);

export const executeCommandOutputSchema = z
  .object({
    exitCode: z.number().int().nullable(),
    signal: z.string().min(1).nullable(),
    timedOut: z.boolean(),
    aborted: z.boolean(),
    timeoutMs: z.number().int().nonnegative(),
    stdout: z.string(),
    stderr: z.string(),
    durationMs: z.number().int().nonnegative(),
    truncated: z
      .object({
        stdout: z.boolean(),
        stderr: z.boolean(),
      })
      .strict(),
    collection: executeCommandCollectionSchema.optional(),
  })
  .strict();

export const executeCommandPublicResultSchema = executeCommandOutputSchema.omit({
  stdout: true,
  stderr: true,
});

export type ExecuteCommandInput = z.infer<typeof executeCommandInputSchema>;
export type ExecuteCommandInputSummary = z.infer<typeof executeCommandInputSummarySchema>;
export type ExecuteCommandOutput = z.infer<typeof executeCommandOutputSchema>;
export type ExecuteCommandPublicResult = z.infer<typeof executeCommandPublicResultSchema>;

export function toExecuteCommandInputSummary(
  input: ExecuteCommandInput,
): ExecuteCommandInputSummary {
  return {
    command: summarizeCommand(input.command),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.inputFiles !== undefined ? { inputFiles: input.inputFiles } : {}),
    ...(input.output !== undefined ? { output: input.output } : {}),
  };
}
