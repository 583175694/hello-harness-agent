import { z } from 'zod';
import { artifactRefSchema, fileRefSchema } from '../files/contracts.js';

export const EXECUTE_COMMAND_PUBLIC_COMMAND_MAX = 200;
export const EXECUTE_COMMAND_COMMAND_MAX = 8_000;
export const BASH_DESCRIPTION_MAX = 2_000;

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

export const bashSandboxPermissionSchema = z.enum(['network', 'install']);

const bashInputFilesSchema = z
  .array(
    z
      .object({
        fileId: z.string().min(1),
        path: workspaceRelativePathSchema,
      })
      .strict(),
  )
  .max(10)
  .optional();

const bashOutputSchema = z
  .object({
    path: workspaceRelativePathSchema,
    fileName: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .optional();

const bashCoreFields = {
  command: z
    .string()
    .min(1)
    .refine((value) => unicodeLength(value) <= EXECUTE_COMMAND_COMMAND_MAX, {
      message: `command exceeds ${EXECUTE_COMMAND_COMMAND_MAX} code points`,
    }),
  description: z
    .string()
    .trim()
    .min(1)
    .refine((value) => unicodeLength(value) <= BASH_DESCRIPTION_MAX, {
      message: `description exceeds ${BASH_DESCRIPTION_MAX} code points`,
    }),
  workdir: workspaceRelativePathSchema.optional(),
  timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
  inputFiles: bashInputFilesSchema,
  output: bashOutputSchema,
  sandbox_permissions: z.array(bashSandboxPermissionSchema).min(1).max(2).optional(),
  justification: z.string().trim().min(1).max(2_000).optional(),
  run_in_background: z.boolean().optional(),
};

function normalizeLegacyCwd(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (record.workdir !== undefined || record.cwd === undefined) return value;
  const { cwd, ...rest } = record;
  return { ...rest, workdir: cwd };
}

export const bashInputSchema = z
  .preprocess(normalizeLegacyCwd, z.object(bashCoreFields).strict())
  .superRefine((value, context) => {
    if (value.sandbox_permissions?.length && !value.justification) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'sandbox_permissions 需要 justification',
        path: ['justification'],
      });
    }
  });

/** @deprecated C3-A 名称；新 Run 使用 bash */
export const executeCommandInputSchema = bashInputSchema;

export const bashInputSummarySchema = z
  .object({
    command: z.string().min(1),
    description: z.string().min(1),
    workdir: z.string().min(1).optional(),
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
    policyClass: bashSandboxPermissionSchema.optional(),
  })
  .strict();

export const executeCommandInputSummarySchema = bashInputSummarySchema;

const collectionErrorSchema = z
  .object({
    code: z.string().min(1),
    detail: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();

export const bashCollectionSchema = z.discriminatedUnion('status', [
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

export const executeCommandCollectionSchema = bashCollectionSchema;

const bashSpillSchema = z
  .object({
    stdout: z.object({ artifactId: z.string().min(1) }).strict().optional(),
    stderr: z.object({ artifactId: z.string().min(1) }).strict().optional(),
  })
  .strict()
  .optional();

export const bashBackgroundResultSchema = z
  .object({
    kind: z.literal('background'),
    jobId: z.string().min(1),
  })
  .strict();

/** Workbench Terminal 卡片与 CoT 共用的 bash 展示视图（可含 UI 专用 render 文本，不进模型 transcript）。 */
export const bashTerminalViewSchema = z
  .object({
    description: z.string().min(1),
    command: z.string().min(1),
    workdir: z.string().min(1).optional(),
    renderedOutput: z.string().optional(),
    exitCode: z.number().int().nullable().optional(),
    exitSignal: z.string().min(1).nullable().optional(),
    jobId: z.string().min(1).optional(),
  })
  .strict();

export const BASH_TERMINAL_RENDERED_OUTPUT_MAX = 32_000;

export type BashTerminalView = z.infer<typeof bashTerminalViewSchema>;

/** Workbench Terminal 输入区：完整 command，不经过 public summary 截断。 */
export const bashTerminalCommandInputSchema = z
  .object({
    description: z.string().min(1),
    command: z
      .string()
      .min(1)
      .refine((value) => unicodeLength(value) <= EXECUTE_COMMAND_COMMAND_MAX, {
        message: `command exceeds ${EXECUTE_COMMAND_COMMAND_MAX} code points`,
      }),
    workdir: z.string().min(1).optional(),
  })
  .strict();

export type BashTerminalCommandInput = z.infer<typeof bashTerminalCommandInputSchema>;

export function toBashTerminalCommandInput(input: BashInput): BashTerminalCommandInput {
  return {
    description: input.description,
    command: input.command,
    ...(input.workdir !== undefined ? { workdir: input.workdir } : {}),
  };
}

export const bashRunResultSchema = z
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
    spill: bashSpillSchema,
    collection: bashCollectionSchema.optional(),
  })
  .strict();

export const executeCommandOutputSchema = bashRunResultSchema;
export const bashPublicResultSchema = bashRunResultSchema.omit({
  stdout: true,
  stderr: true,
});
export const executeCommandPublicResultSchema = bashPublicResultSchema;

/** SSE / UI 侧 bash（及 execute_command）工具完成时的公开结果。 */
export const bashPublicToolResultSchema = z.union([
  bashPublicResultSchema,
  bashBackgroundResultSchema,
]);

export type BashInput = z.infer<typeof bashInputSchema>;
export type BashInputSummary = z.infer<typeof bashInputSummarySchema>;
export type BashRunResult = z.infer<typeof bashRunResultSchema>;
export type BashBackgroundResult = z.infer<typeof bashBackgroundResultSchema>;
export type BashToolSuccess = BashRunResult | BashBackgroundResult;

export const jobOutputInputSchema = z
  .object({
    job_id: z.string().min(1),
    wait: z.boolean().optional(),
    timeout_ms: z.number().int().min(0).max(600_000).optional(),
  })
  .strict();

export const jobListInputSchema = z.object({}).strict();

export const jobKillInputSchema = z
  .object({
    job_id: z.string().min(1),
  })
  .strict();

export type JobOutputInput = z.infer<typeof jobOutputInputSchema>;
export type JobListInput = z.infer<typeof jobListInputSchema>;
export type JobKillInput = z.infer<typeof jobKillInputSchema>;

export const jobToolActivityPresentationSchema = z.enum(['job']);
export const jobToolActivityFieldsSchema = z
  .object({
    presentation: jobToolActivityPresentationSchema,
    jobId: z.string().min(1).optional(),
    jobStatus: z.string().min(1).optional(),
  })
  .strict();

/** job_output / job_list / job_kill 对 UI 与 SSE 的公开文本结果。 */
export const sandboxJobToolTextResultSchema = z.object({ text: z.string() }).strict();
export type SandboxJobToolTextResult = z.infer<typeof sandboxJobToolTextResultSchema>;
export type BashPublicResult = z.infer<typeof bashPublicResultSchema>;
export type BashPublicToolResult = z.infer<typeof bashPublicToolResultSchema>;
export type ExecuteCommandInput = BashInput;
export type ExecuteCommandInputSummary = BashInputSummary;
export type ExecuteCommandOutput = BashRunResult;
export type ExecuteCommandPublicResult = BashPublicResult;

export function toBashInputSummary(input: BashInput, policyClass?: BashInputSummary['policyClass']): BashInputSummary {
  return {
    command: summarizeCommand(input.command),
    description: summarizeCommand(input.description, 120),
    ...(input.workdir !== undefined ? { workdir: input.workdir } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.inputFiles !== undefined ? { inputFiles: input.inputFiles } : {}),
    ...(input.output !== undefined ? { output: input.output } : {}),
    ...(policyClass ? { policyClass } : {}),
  };
}

export const toExecuteCommandInputSummary = toBashInputSummary;

export function hashBashApprovalBase(input: BashInput): string {
  const payload = {
    command: input.command,
    workdir: input.workdir ?? '.',
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.inputFiles !== undefined ? { inputFiles: input.inputFiles } : {}),
    ...(input.output !== undefined ? { output: input.output } : {}),
  };
  const ordered = JSON.stringify(payload, (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  });
  return ordered;
}

export const bashToolActivityPresentationSchema = z.enum(['terminal']);

export const bashToolActivityFieldsSchema = z
  .object({
    presentation: bashToolActivityPresentationSchema,
    description: z.string().min(1),
    exitCode: z.number().int().nullable().optional(),
    exitSignal: z.string().min(1).nullable().optional(),
  })
  .strict();
