import { HttpException, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import {
  AGENT_ERROR_CODES,
  AGENT_TOOL_NAMES,
  bashBackgroundResultSchema,
  bashInputSchema,
  bashRunResultSchema,
  spillReferenceLine,
  type BashInput,
  type BashRunResult,
  type BashToolSuccess,
} from '@harness/agent-protocol';
import { ArtifactsService } from '../artifacts/artifacts.service';
import {
  extractHostsFromCommand,
  isHostAllowed,
  mergedEgressAllowlist,
  readSandboxRuntimeConfig,
  sandboxLimits,
} from '../sandbox/sandbox-config';
import { SandboxError } from '../sandbox/sandbox-error';
import { SandboxEgressAuditService } from '../sandbox/sandbox-egress-audit.service';
import { SandboxJobService } from '../sandbox/sandbox-job.service';
import { SandboxManagerService } from '../sandbox/sandbox-manager.service';
import { resolveWorkspacePath } from '../sandbox/sandbox-path';
import { SandboxWorkspaceService } from '../sandbox/sandbox-workspace.service';
import { BashCommandPolicyService } from '../sandbox/bash-command-policy.service';
import { mergeSandboxExecuteEnv, sandboxTerminalEnv } from '../sandbox/sandbox-shell-env';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

const TOOL_DESCRIPTION =
  '在隔离云端工作区执行一条 bash 命令（每次调用是新的 shell；文件与已装依赖会保留）。' +
  '必须提供 description。路径相对工作区；Host 文件用 inputFiles Stage、output Collect。' +
  '非零退出是命令结果。外网默认不可用；需要 curl/pip install 等时按提示申请 network/install 权限。' +
  'Browser 镜像下预装 agent-browser：JS 渲染页、截图与下载用 agent-browser CLI（路径在 workspace，截图/下载用 output Collect）；静态公开页优先 web_fetch。访问 HTTPS 需 network 权限。';

@Injectable()
export class BashTool implements AgentTool<BashInput, BashToolSuccess> {
  readonly name = AGENT_TOOL_NAMES.bash;
  readonly inputSchema = bashInputSchema as ZodType<BashInput>;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = {
    timeoutMs: sandboxLimits.toolOuterTimeoutMs,
    approval: 'auto_execute',
  } as const;

  constructor(
    private readonly manager: SandboxManagerService,
    private readonly workspace: SandboxWorkspaceService,
    private readonly artifacts: ArtifactsService,
    private readonly jobs: SandboxJobService,
    private readonly bashPolicy: BashCommandPolicyService,
    private readonly egressAudit: SandboxEgressAuditService,
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
          description: { type: 'string', minLength: 1 },
          workdir: { type: 'string' },
          timeoutMs: { type: 'number', minimum: 1000, maximum: 600000 },
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
          sandbox_permissions: {
            type: 'array',
            items: { type: 'string', enum: ['network', 'install'] },
            minItems: 1,
            maxItems: 2,
          },
          justification: { type: 'string', minLength: 1 },
          run_in_background: { type: 'boolean' },
        },
        required: ['command', 'description'],
      },
    };
  }

  isAvailable(): boolean {
    return this.manager.isAvailable();
  }

  async execute(
    input: BashInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<BashToolSuccess>> {
    if (!context.runId) {
      return this.failed(AGENT_ERROR_CODES.sandboxUnavailable, '命令执行缺少运行上下文。', false);
    }
    const spec = this.resolve(input);
    if (input.run_in_background && input.output) {
      return this.failed(
        AGENT_ERROR_CODES.invalidToolArguments,
        '后台命令不支持 output Collect；请在前台 bash 或 job 结束后再 Collect。',
        false,
      );
    }
    try {
      if (context.runId) {
        this.manager.acquireRunLease(context.sessionId, context.runId);
      }
      if (input.run_in_background) {
        await this.manager.withSession(context.sessionId, async (session) => {
          if (input.inputFiles?.length) {
            await this.workspace.stage(context.sessionId, session, input.inputFiles);
          }
        });
        this.assertEgressAllowed(input, context);
        const { jobId } = await this.jobs.startBackground({
          sessionId: context.sessionId,
          runId: context.runId,
          bash: input,
          cwd: spec.cwd,
          env: spec.env,
          egressBoost: context.bashEgressBoost,
          egressBoostHosts: context.bashEgressBoost
            ? extractHostsFromCommand(input.command)
            : undefined,
        });
        const output = bashBackgroundResultSchema.parse({ kind: 'background', jobId });
        return { status: 'succeeded', output, logFields: { jobId } };
      }
      this.assertEgressAllowed(input, context);
      const commandResult = await this.manager.withSession(context.sessionId, async (session) => {
        if (input.inputFiles?.length) {
          await this.workspace.stage(context.sessionId, session, input.inputFiles);
        }
        return session.execute({
          command: spec.command,
          cwd: spec.cwd,
          timeoutMs: spec.timeoutMs,
          signal: context.signal,
          env: mergeSandboxExecuteEnv(context.sessionId, spec.env),
          egressBoost: context.bashEgressBoost,
          egressBoostHosts: context.bashEgressBoost
            ? extractHostsFromCommand(input.command)
            : undefined,
        });
      });

      const spilled = await this.applySpill(commandResult, context);
      let collection: BashRunResult['collection'];
      const finished = !commandResult.timedOut && !commandResult.aborted;
      if (finished && input.output) {
        try {
          const imported = await this.manager.withSession(context.sessionId, (session) =>
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
              code: AGENT_ERROR_CODES.sandboxCollectFailed,
              detail: mapped.detail,
              retryable: mapped.retryable,
            },
          };
        }
      }

      const output = bashRunResultSchema.parse({
        exitCode: commandResult.exitCode,
        signal: commandResult.signal,
        timedOut: commandResult.timedOut,
        aborted: commandResult.aborted,
        timeoutMs: commandResult.timeoutMs,
        stdout: spilled.stdout,
        stderr: spilled.stderr,
        durationMs: commandResult.durationMs,
        truncated: {
          stdout: spilled.truncated.stdout,
          stderr: spilled.truncated.stderr,
        },
        ...(spilled.spill ? { spill: spilled.spill } : {}),
        ...(collection ? { collection } : {}),
      });

      if (commandResult.timedOut) {
        if (this.shouldInvalidate(context.sessionId, context.signal, commandResult)) {
          await this.manager.invalidate(context.sessionId);
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
        if (this.shouldInvalidate(context.sessionId, context.signal, commandResult)) {
          await this.manager.invalidate(context.sessionId);
        }
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
        if (this.shouldInvalidate(context.sessionId, context.signal, { timedOut: false, aborted: true })) {
          await this.manager.invalidate(context.sessionId).catch(() => undefined);
        }
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

  resolve(input: BashInput): {
    command: string;
    cwd: string;
    timeoutMs: number;
    env: Record<string, string>;
  } {
    const timeoutMs = Math.min(
      sandboxLimits.commandMaxMs,
      Math.max(sandboxLimits.commandMinMs, input.timeoutMs ?? sandboxLimits.commandDefaultMs),
    );
    return {
      command: input.command,
      cwd: resolveWorkspacePath(input.workdir ?? '.'),
      timeoutMs,
      env: sandboxTerminalEnv(),
    };
  }

  private async applySpill(
    commandResult: {
      stdout: string;
      stderr: string;
      truncatedStdout?: boolean;
      truncatedStderr?: boolean;
      fullStdout?: string;
      fullStderr?: string;
    },
    context: ToolExecutionContext,
  ): Promise<{
    stdout: string;
    stderr: string;
    truncated: { stdout: boolean; stderr: boolean };
    spill?: BashRunResult['spill'];
  }> {
    let stdout = commandResult.stdout;
    let stderr = commandResult.stderr;
    const spill: NonNullable<BashRunResult['spill']> = {};
    if (commandResult.truncatedStdout && commandResult.fullStdout && context.runId) {
      const imported = await this.artifacts.importFromSandbox({
        sessionId: context.sessionId,
        runId: context.runId,
        toolCallId: `${context.toolCallId}:stdout-spill`,
        fileName: 'bash-stdout.txt',
        data: Buffer.from(commandResult.fullStdout, 'utf8'),
      });
      spill.stdout = { artifactId: imported.artifact.artifactId };
      stdout = `${spillReferenceLine(imported.artifact.artifactId)}\n${stdout.replace(/^\[output truncated\]\n?/u, '')}`;
    }
    if (commandResult.truncatedStderr && commandResult.fullStderr && context.runId) {
      const imported = await this.artifacts.importFromSandbox({
        sessionId: context.sessionId,
        runId: context.runId,
        toolCallId: `${context.toolCallId}:stderr-spill`,
        fileName: 'bash-stderr.txt',
        data: Buffer.from(commandResult.fullStderr, 'utf8'),
      });
      spill.stderr = { artifactId: imported.artifact.artifactId };
      stderr = `${spillReferenceLine(imported.artifact.artifactId)}\n${stderr.replace(/^\[output truncated\]\n?/u, '')}`;
    }
    return {
      stdout,
      stderr,
      truncated: {
        stdout: Boolean(commandResult.truncatedStdout),
        stderr: Boolean(commandResult.truncatedStderr),
      },
      ...(Object.keys(spill).length ? { spill } : {}),
    };
  }

  private shouldInvalidate(
    sessionId: string,
    signal: AbortSignal | undefined,
    result: { timedOut: boolean; aborted: boolean },
  ): boolean {
    if (this.manager.getRunningJobCount(sessionId) > 0) return false;
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

  private assertEgressAllowed(input: BashInput, context: ToolExecutionContext): void {
    if (!context.bashEgressBoost) return;
    const policy = this.bashPolicy.classify(input);
    if (policy !== 'network' && policy !== 'install') return;
    const config = readSandboxRuntimeConfig();
    const hosts = extractHostsFromCommand(input.command);
    if (!hosts.length) return;
    if (!config.egressHostAllowlistEnforced) {
      this.egressAudit.record({
        sessionId: context.sessionId,
        runId: context.runId,
        toolCallId: context.toolCallId,
        hosts,
        decision: 'allow',
      });
      return;
    }
    const allowlist = mergedEgressAllowlist(config);
    const denied = hosts.filter((host) => !isHostAllowed(host, allowlist));
    this.egressAudit.record({
      sessionId: context.sessionId,
      runId: context.runId,
      toolCallId: context.toolCallId,
      hosts,
      decision: denied.length ? 'deny' : 'allow',
    });
    if (denied.length) {
      throw new SandboxError(
        AGENT_ERROR_CODES.sandboxUnavailable,
        `[sandbox: network denied; hosts not in allowlist: ${denied.join(', ')}. ` +
          '设置 SANDBOX_EGRESS_ALLOWLIST_EXTRA 或关闭 SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED（开放阶段默认 false）。]',
        false,
      );
    }
  }

  private failed(
    code: string,
    detail: string,
    retryable: boolean,
  ): ToolExecutionResult<BashToolSuccess> {
    return { status: 'failed', error: { code, detail, retryable } };
  }

  private logFields(output: BashRunResult) {
    return {
      exitCode: output.exitCode ?? -1,
      timedOut: output.timedOut,
      aborted: output.aborted,
      durationMs: output.durationMs,
    };
  }
}
