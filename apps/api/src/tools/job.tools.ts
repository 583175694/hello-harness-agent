import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import {
  AGENT_ERROR_CODES,
  AGENT_TOOL_NAMES,
  jobKillInputSchema,
  jobListInputSchema,
  jobOutputInputSchema,
  renderJobKillText,
  renderJobListText,
  renderJobOutputText,
  type JobKillInput,
  type JobListInput,
  type JobOutputInput,
} from '@harness/agent-protocol';
import { readSandboxRuntimeConfig, sandboxLimits } from '../sandbox/sandbox-config';
import { SandboxJobService } from '../sandbox/sandbox-job.service';
import { SandboxManagerService } from '../sandbox/sandbox-manager.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

@Injectable()
export class JobOutputTool implements AgentTool<JobOutputInput, string> {
  readonly name = AGENT_TOOL_NAMES.jobOutput;
  readonly inputSchema = jobOutputInputSchema as ZodType<JobOutputInput>;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = {
    timeoutMs: sandboxLimits.jobWaitMaxMs + sandboxLimits.cancellationGraceMs + 5_000,
    approval: 'auto_execute',
  } as const;

  constructor(
    private readonly manager: SandboxManagerService,
    private readonly jobs: SandboxJobService,
  ) {}

  definition() {
    return {
      name: this.name,
      description: '读取 Session 内后台 job 的增量 stdout/stderr；可选 wait 直到结束或超时。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          job_id: { type: 'string', minLength: 1 },
          wait: { type: 'boolean' },
          timeout_ms: { type: 'number', minimum: 0, maximum: 600000 },
        },
        required: ['job_id'],
      },
    };
  }

  isAvailable(): boolean {
    return this.manager.isAvailable();
  }

  async execute(
    input: JobOutputInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<string>> {
    const config = readSandboxRuntimeConfig();
    const timeoutMs = Math.min(
      config.jobWaitMaxMs,
      input.timeout_ms ?? config.jobWaitDefaultMs,
    );
    try {
      const result = await this.jobs.readJobOutput({
        sessionId: context.sessionId,
        jobId: input.job_id,
        wait: Boolean(input.wait),
        timeoutMs,
      });
      if (result.settled) {
        this.jobs.markCompletionReported(context.sessionId, input.job_id);
        await this.jobs.syncRunningCounts(context.sessionId);
      }
      const text = renderJobOutputText({
        stdout: result.stdout,
        stderr: result.stderr,
        status: result.status,
        hadNewOutput: result.hadNewOutput,
      });
      return { status: 'succeeded', output: text };
    } catch (error) {
      if (error instanceof Error && error.message === 'JOB_NOT_FOUND') {
        return {
          status: 'failed',
          error: {
            code: AGENT_ERROR_CODES.invalidToolArguments,
            detail: 'job 不存在或不属于当前 Session。',
            retryable: false,
          },
        };
      }
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.sandboxExecutionUnknown,
          detail: '读取 job 输出失败。',
          retryable: true,
        },
      };
    }
  }
}

@Injectable()
export class JobListTool implements AgentTool<JobListInput, string> {
  readonly name = AGENT_TOOL_NAMES.jobList;
  readonly inputSchema = jobListInputSchema as ZodType<JobListInput>;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = { timeoutMs: 60_000, approval: 'auto_execute' } as const;

  constructor(
    private readonly manager: SandboxManagerService,
    private readonly jobs: SandboxJobService,
  ) {}

  definition() {
    return {
      name: this.name,
      description: '列出当前 Session 的后台 job 及状态。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
    };
  }

  isAvailable(): boolean {
    return this.manager.isAvailable();
  }

  async execute(
    _input: JobListInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<string>> {
    const jobs = await this.jobs.listJobs(context.sessionId);
    await this.jobs.syncRunningCounts(context.sessionId);
    return {
      status: 'succeeded',
      output: renderJobListText(
        jobs.map((job) => ({
          id: job.jobId,
          status: job.status,
          description: job.description,
        })),
      ),
    };
  }
}

@Injectable()
export class JobKillTool implements AgentTool<JobKillInput, string> {
  readonly name = AGENT_TOOL_NAMES.jobKill;
  readonly inputSchema = jobKillInputSchema as ZodType<JobKillInput>;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = { timeoutMs: 120_000, approval: 'auto_execute' } as const;

  constructor(
    private readonly manager: SandboxManagerService,
    private readonly jobs: SandboxJobService,
  ) {}

  definition() {
    return {
      name: this.name,
      description: '终止当前 Session 内指定后台 job（进程组 TERM/KILL）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { job_id: { type: 'string', minLength: 1 } },
        required: ['job_id'],
      },
    };
  }

  isAvailable(): boolean {
    return this.manager.isAvailable();
  }

  async execute(
    input: JobKillInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<string>> {
    try {
      const result = await this.jobs.killJob(context.sessionId, input.job_id);
      await this.jobs.syncRunningCounts(context.sessionId);
      return {
        status: 'succeeded',
        output: renderJobKillText(input.job_id, result.status),
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'JOB_NOT_FOUND') {
        return {
          status: 'failed',
          error: {
            code: AGENT_ERROR_CODES.invalidToolArguments,
            detail: 'job 不存在或不属于当前 Session。',
            retryable: false,
          },
        };
      }
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.sandboxExecutionUnknown,
          detail: '终止 job 失败。',
          retryable: true,
        },
      };
    }
  }
}
