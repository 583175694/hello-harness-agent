import { HttpException, Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  AGENT_TOOL_NAMES,
  executeCommandInputSchema,
  executeCommandOutputSchema,
  type ExecuteCommandInput,
  type ExecuteCommandOutput,
} from '@harness/agent-protocol';
import { sandboxLimits } from '../sandbox/sandbox-config';
import { SandboxError } from '../sandbox/sandbox-error';
import { SandboxManagerService } from '../sandbox/sandbox-manager.service';
import { resolveWorkspacePath } from '../sandbox/sandbox-path';
import { SandboxWorkspaceService } from '../sandbox/sandbox-workspace.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

const TOOL_DESCRIPTION =
  '在隔离的云端工作区用 bash -c 执行一条命令。每次调用是新的 shell，cwd/变量/函数不保留；同一 Run 的文件和已装依赖会保留。路径必须相对工作区。需要输入文件时用 inputFiles，需要带回一个文件时用 output。非零退出是命令结果。不要假设外网可用。';

@Injectable()
export class ExecuteCommandTool implements AgentTool<ExecuteCommandInput, ExecuteCommandOutput> {
  readonly name = AGENT_TOOL_NAMES.executeCommand;
  readonly inputSchema = executeCommandInputSchema;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = {
    timeoutMs: sandboxLimits.toolOuterTimeoutMs,
    approval: 'require_approval',
  } as const;

  constructor(
    private readonly manager: SandboxManagerService,
    private readonly workspace: SandboxWorkspaceService,
  ) {}

  definition() {
    return {
      name: this.name,
      description: TOOL_DESCRIPTION,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          command: { type: 'string', minLength: 1 },
          cwd: { type: 'string' },
          timeoutMs: { type: 'number', minimum: 1000, maximum: 120000 },
          inputFiles: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                fileId: { type: 'string' },
                path: { type: 'string' },
              },
              required: ['fileId', 'path'],
            },
          },
          output: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string' },
              fileName: { type: 'string' },
            },
            required: ['path'],
          },
        },
        required: ['command'],
      },
    };
  }

  isAvailable(): boolean {
    return this.manager.isAvailable();
  }

  async execute(
    input: ExecuteCommandInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<ExecuteCommandOutput>> {
    if (!context.runId) {
      return this.failed(AGENT_ERROR_CODES.sandboxUnavailable, '命令执行缺少运行上下文。', false);
    }
    const spec = this.resolve(input);
    try {
      const commandResult = await this.manager.withSession(context.runId, async (session) => {
        if (input.inputFiles?.length) {
          await this.workspace.stage(context.sessionId, session, input.inputFiles);
        }
        return session.execute({
          command: spec.command,
          cwd: spec.cwd,
          timeoutMs: spec.timeoutMs,
          signal: context.signal,
        });
      });

      let collection: ExecuteCommandOutput['collection'];
      const finished = !commandResult.timedOut && !commandResult.aborted;
      if (finished && input.output) {
        try {
          const imported = await this.manager.withSession(context.runId, (session) =>
            this.workspace.collect({
              sessionId: context.sessionId,
              runId: context.runId!,
              toolCallId: context.toolCallId,
              session,
              output: input.output!,
            }),
          );
          collection = { status: 'collected', artifact: imported.artifact, file: imported.file };
        } catch (error) {
          const mapped = this.mapError(error);
          collection = {
            status: 'failed',
            error: {
              code: mapped.code === AGENT_ERROR_CODES.sandboxCollectFailed
                ? mapped.code
                : AGENT_ERROR_CODES.sandboxCollectFailed,
              detail: mapped.detail,
              retryable: mapped.retryable,
            },
          };
        }
      }

      const output = executeCommandOutputSchema.parse({
        ...commandResult,
        truncated: {
          stdout: commandResult.stdout.includes('[truncated]'),
          stderr: commandResult.stderr.includes('[truncated]'),
        },
        ...(collection ? { collection } : {}),
      });

      if (commandResult.timedOut) {
        if (this.shouldInvalidate(context.signal, commandResult)) {
          await this.manager.invalidate(context.runId);
        }
        return {
          status: 'timeout',
          error: {
            code: AGENT_ERROR_CODES.toolTimeout,
            detail: '命令执行超时。',
            retryable: true,
          },
          logFields: this.logFields(output),
        };
      }
      if (commandResult.aborted) {
        await this.manager.invalidate(context.runId);
        return {
          status: 'cancelled',
          error: {
            code: AGENT_ERROR_CODES.toolCancelled,
            detail: '命令执行已取消。',
            retryable: true,
          },
          logFields: this.logFields(output),
        };
      }
      return { status: 'succeeded', output, logFields: this.logFields(output) };
    } catch (error) {
      if (context.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        await this.manager.invalidate(context.runId).catch(() => undefined);
        return {
          status: 'cancelled',
          error: {
            code: AGENT_ERROR_CODES.toolCancelled,
            detail: '命令执行已取消。',
            retryable: true,
            cause: error,
          },
        };
      }
      const mapped = this.mapError(error);
      return {
        status: 'failed',
        error: mapped,
      };
    }
  }

  resolve(input: ExecuteCommandInput): { command: string; cwd: string; timeoutMs: number } {
    const timeoutMs = Math.min(
      sandboxLimits.commandMaxMs,
      Math.max(sandboxLimits.commandMinMs, input.timeoutMs ?? sandboxLimits.commandDefaultMs),
    );
    return {
      command: input.command,
      cwd: resolveWorkspacePath(input.cwd ?? '.'),
      timeoutMs,
    };
  }

  private shouldInvalidate(
    signal: AbortSignal | undefined,
    result: { timedOut: boolean; aborted: boolean },
  ): boolean {
    return result.timedOut || result.aborted || Boolean(signal?.aborted);
  }

  private mapError(error: unknown): {
    code: string;
    detail: string;
    retryable: boolean;
    cause?: unknown;
  } {
    if (error instanceof SandboxError) {
      return {
        code: error.code,
        detail: error.detail,
        retryable: error.retryable,
        cause: error,
      };
    }
    const response = error instanceof HttpException ? error.getResponse() : undefined;
    if (typeof response === 'object' && response !== null) {
      const record = response as Record<string, unknown>;
      if (typeof record.code === 'string' && typeof record.detail === 'string') {
        return {
          code: record.code,
          detail: record.detail,
          retryable: record.code === AGENT_ERROR_CODES.sandboxCollectFailed,
          cause: error,
        };
      }
    }
    return {
      code: AGENT_ERROR_CODES.sandboxExecutionUnknown,
      detail: '命令执行结果未知。',
      retryable: false,
      cause: error,
    };
  }

  private failed(
    code: string,
    detail: string,
    retryable: boolean,
  ): ToolExecutionResult<ExecuteCommandOutput> {
    return { status: 'failed', error: { code, detail, retryable } };
  }

  private logFields(output: ExecuteCommandOutput) {
    return {
      exitCode: output.exitCode ?? -1,
      timedOut: output.timedOut,
      aborted: output.aborted,
      durationMs: output.durationMs,
    };
  }
}
