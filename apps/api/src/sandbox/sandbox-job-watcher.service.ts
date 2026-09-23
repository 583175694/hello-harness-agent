import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../database/prisma.service';
import { readSandboxRuntimeConfig } from './sandbox-config';
import { SandboxInstanceRepository } from './sandbox-instance.repository';
import type { JobMeta } from './sandbox-job.service';
import { SandboxJobService } from './sandbox-job.service';
import { SandboxManagerService } from './sandbox-manager.service';
import { SANDBOX_JOB_SERVICE, SANDBOX_MANAGER_SERVICE } from './sandbox-job.tokens';
import type { RunCommandService } from '../runs/run-command.service';
import type { PendingUserInputService } from '../runs/pending-user-input.service';
import { getConfiguredModel } from '../model/model-catalog';

@Injectable()
export class SandboxJobWatcherService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly wakeBudget = new Map<string, number>();

  constructor(
    @Inject(SANDBOX_JOB_SERVICE) private readonly jobs: SandboxJobService,
    @Inject(SANDBOX_MANAGER_SERVICE) private readonly manager: SandboxManagerService,
    @Optional() private readonly instances: SandboxInstanceRepository | undefined,
    @Optional() private readonly prisma: PrismaService | undefined,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Optional() @Inject(Logger) private readonly logger?: Logger,
  ) {}

  onModuleInit(): void {
    const interval = readSandboxRuntimeConfig().jobWatcherIntervalMs;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  resetWakeBudget(sessionId: string): void {
    this.wakeBudget.set(sessionId, 0);
  }

  async tick(): Promise<void> {
    if (!this.instances?.enabled() || !this.manager.isAvailable()) return;
    const rows = await this.instances.listActive();
    for (const row of rows) {
      await this.jobs.syncRunningCounts(row.sessionId);
      const jobs = await this.jobs.listJobs(row.sessionId);
      for (const job of jobs) {
        if (job.status !== 'running' && !job.completionReported) {
          await this.deliverCompletion(row.sessionId, job);
        }
      }
    }
  }

  private async deliverCompletion(sessionId: string, job: JobMeta): Promise<void> {
    const config = readSandboxRuntimeConfig();
    const message = `background job ${job.jobId} (bash: ${job.description}) finished [status: ${job.status}]. Read its output with job_output.`;
    const busy = await this.hasActiveRun(sessionId);
    if (busy) {
      await this.resolvePendingInputs()?.enqueueFollowUp(sessionId, message, `job-notice:${job.jobId}`);
      this.jobs.markCompletionReported(sessionId, job.jobId);
      return;
    }
    if (config.jobCompletionDelivery === 'quiet') {
      await this.resolvePendingInputs()?.enqueueFollowUp(sessionId, message, `job-notice:${job.jobId}`);
      this.jobs.markCompletionReported(sessionId, job.jobId);
      return;
    }
    const budget = this.wakeBudget.get(sessionId) ?? 0;
    if (budget >= config.jobMaxConsecutiveWakes) {
      await this.resolvePendingInputs()?.enqueueFollowUp(sessionId, message, `job-notice:${job.jobId}`);
      this.jobs.markCompletionReported(sessionId, job.jobId);
      return;
    }
    const runCommands = await this.resolveRunCommands();
    if (!runCommands) return;
    const model = getConfiguredModel(process.env.DEFAULT_MODEL ?? 'deepseek-chat')?.id ?? 'deepseek-chat';
    try {
      await runCommands.create(sessionId, {
        content: message,
        idempotencyKey: `job-wakeup:${job.jobId}`,
        model,
      });
      this.wakeBudget.set(sessionId, budget + 1);
      this.jobs.markCompletionReported(sessionId, job.jobId);
    } catch (error) {
      this.logger?.warn(
        `Job wakeup 失败 | session=${sessionId} | job=${job.jobId}`,
        SandboxJobWatcherService.name,
      );
      void error;
    }
  }

  private async hasActiveRun(sessionId: string): Promise<boolean> {
    if (!this.prisma) return false;
    const active = await this.prisma.agentRun.findFirst({
      where: { sessionId, status: { in: ['queued', 'running', 'cancel_requested'] } },
    });
    return Boolean(active);
  }

  private async resolveRunCommands(): Promise<RunCommandService | undefined> {
    const { RunCommandService: RunCommands } = await import('../runs/run-command.service');
    return this.moduleRef.get(RunCommands, { strict: false });
  }

  private resolvePendingInputs(): PendingUserInputService | undefined {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PendingUserInputService: PendingInputs } = require('../runs/pending-user-input.service');
    return this.moduleRef.get(PendingInputs, { strict: false });
  }
}
