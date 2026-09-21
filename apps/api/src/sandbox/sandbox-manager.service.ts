import { Inject, Injectable, Optional } from '@nestjs/common';
import { sandboxLimits } from './sandbox-config';
import { SandboxError, sandboxUnavailable } from './sandbox-error';
import type { SandboxCommandInput, SandboxCommandResult, SandboxProvider, SandboxSession } from './sandbox.types';
import { SANDBOX_PROVIDER } from './sandbox.types';
import { FakeSandboxProvider } from './fake-sandbox.provider';
import { readSandboxRuntimeConfig, isSandboxConfigured } from './sandbox-config';

type RunEntry = {
  session?: SandboxSession;
  creating?: Promise<SandboxSession>;
  queue: Promise<unknown>;
};

@Injectable()
export class SandboxManagerService {
  private readonly runs = new Map<string, RunEntry>();

  constructor(
    @Optional() @Inject(SANDBOX_PROVIDER) private readonly provider: SandboxProvider | undefined,
  ) {}

  isAvailable(): boolean {
    if (!this.provider) return false;
    const config = readSandboxRuntimeConfig();
    if (isSandboxConfigured(config)) return true;
    return process.env.NODE_ENV === 'test' && this.provider instanceof FakeSandboxProvider;
  }

  async execute(runId: string, input: SandboxCommandInput): Promise<SandboxCommandResult> {
    return this.enqueue(runId, async () => {
      const session = await this.ensureSession(runId);
      try {
        return await session.execute(input);
      } catch (error) {
        if (error instanceof SandboxError) throw error;
        throw sandboxUnavailable('Sandbox 执行失败。');
      }
    });
  }

  async withSession<T>(runId: string, work: (session: SandboxSession) => Promise<T>): Promise<T> {
    return this.enqueue(runId, async () => work(await this.ensureSession(runId)));
  }

  async invalidate(runId: string): Promise<void> {
    const entry = this.runs.get(runId);
    if (!entry?.session) {
      this.runs.delete(runId);
      return;
    }
    await this.destroySession(entry.session);
    this.runs.delete(runId);
  }

  async releaseRun(runId: string): Promise<void> {
    await this.invalidate(runId);
  }

  async onModuleDestroy(): Promise<void> {
    const ids = [...this.runs.keys()];
    await Promise.allSettled(ids.map((id) => this.bounded(this.releaseRun(id))));
  }

  private async ensureSession(runId: string): Promise<SandboxSession> {
    if (!this.provider) throw sandboxUnavailable('Sandbox Provider 未配置。', false);
    const config = readSandboxRuntimeConfig();
    const allowFake = this.provider instanceof FakeSandboxProvider;
    if (!allowFake && !isSandboxConfigured(config)) {
      throw sandboxUnavailable('Sandbox 未启用或配置不完整。', false);
    }
    const entry = this.entry(runId);
    if (entry.session) return entry.session;
    if (!entry.creating) {
      entry.creating = this.provider.create({
        image: config.image!,
        ttlMs: config.ttlMs,
        metadata: { runId },
      });
    }
    try {
      entry.session = await entry.creating;
      return entry.session;
    } finally {
      entry.creating = undefined;
    }
  }

  private enqueue<T>(runId: string, work: () => Promise<T>): Promise<T> {
    const entry = this.entry(runId);
    const next = entry.queue.then(work, work);
    entry.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private entry(runId: string): RunEntry {
    const existing = this.runs.get(runId);
    if (existing) return existing;
    const created: RunEntry = { queue: Promise.resolve() };
    this.runs.set(runId, created);
    return created;
  }

  private async destroySession(session: SandboxSession): Promise<void> {
    try {
      await this.bounded(session.destroy());
    } catch {
      // TTL 回收兜底；清理失败不抛给 Run。
    }
  }

  private async bounded<T>(work: Promise<T>): Promise<T | undefined> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), sandboxLimits.cleanupTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
