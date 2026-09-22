import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { readSandboxRuntimeConfig, isSandboxConfigured, type SandboxRuntimeConfig } from './sandbox-config';
import { sandboxLimits } from './sandbox-config';
import { SandboxError, sandboxUnavailable } from './sandbox-error';
import type { SandboxCommandInput, SandboxCommandResult, SandboxProvider, SandboxSession } from './sandbox.types';
import { SANDBOX_PROVIDER } from './sandbox.types';
import { FakeSandboxProvider } from './fake-sandbox.provider';
import { SandboxInstanceRepository } from './sandbox-instance.repository';

type SessionEntry = {
  sessionId: string;
  session?: SandboxSession;
  creating?: Promise<SandboxSession>;
  queue: Promise<unknown>;
  runLeases: Set<string>;
  runningJobCount: number;
  hardExpiresAtMs: number;
};

@Injectable()
export class SandboxManagerService implements OnModuleDestroy {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly runToSession = new Map<string, string>();
  private ttlTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Optional() @Inject(SANDBOX_PROVIDER) private readonly provider: SandboxProvider | undefined,
    @Optional() private readonly instances: SandboxInstanceRepository | undefined,
  ) {
    this.ttlTimer = setInterval(() => {
      void this.scanIdleDestroy();
    }, 30_000);
    this.ttlTimer.unref?.();
  }

  isAvailable(): boolean {
    if (!this.provider) return false;
    const config = readSandboxRuntimeConfig();
    if (isSandboxConfigured(config)) return true;
    return process.env.NODE_ENV === 'test' && this.provider instanceof FakeSandboxProvider;
  }

  acquireRunLease(sessionId: string, runId: string): void {
    const entry = this.entry(sessionId);
    entry.runLeases.add(runId);
    this.runToSession.set(runId, sessionId);
  }

  async releaseRunLease(runId: string): Promise<void> {
    const sessionId = this.runToSession.get(runId);
    if (!sessionId) return;
    this.runToSession.delete(runId);
    const entry = this.sessions.get(sessionId);
    entry?.runLeases.delete(runId);
    await this.scheduleDestroyIfIdle(sessionId);
  }

  /** @deprecated C3-C：Run 结束请使用 releaseRunLease */
  async releaseRun(runId: string): Promise<void> {
    await this.releaseRunLease(runId);
  }

  setRunningJobCount(sessionId: string, count: number): void {
    const entry = this.sessions.get(sessionId);
    if (entry) entry.runningJobCount = Math.max(0, count);
  }

  getRunningJobCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.runningJobCount ?? 0;
  }

  async execute(sessionId: string, input: SandboxCommandInput): Promise<SandboxCommandResult> {
    return this.enqueue(sessionId, async () => {
      await this.touchActivity(sessionId);
      const session = await this.ensureSession(sessionId);
      try {
        return await session.execute(input);
      } catch (error) {
        if (error instanceof SandboxError) throw error;
        throw sandboxUnavailable('Sandbox 执行失败。');
      }
    });
  }

  async withSession<T>(sessionId: string, work: (session: SandboxSession) => Promise<T>): Promise<T> {
    return this.enqueue(sessionId, async () => {
      await this.touchActivity(sessionId);
      return work(await this.ensureSession(sessionId));
    });
  }

  async invalidate(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (entry?.session) await this.destroySession(sessionId, entry.session);
    this.sessions.delete(sessionId);
    for (const [runId, mapped] of this.runToSession) {
      if (mapped === sessionId) this.runToSession.delete(runId);
    }
  }

  async destroySessionForSessionDelete(sessionId: string): Promise<void> {
    await this.invalidate(sessionId);
    await this.instances?.deleteBySessionId(sessionId);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ttlTimer) clearInterval(this.ttlTimer);
    const ids = [...this.sessions.keys()];
    await Promise.allSettled(ids.map((id) => this.bounded(this.invalidate(id))));
  }

  private async ensureSession(sessionId: string): Promise<SandboxSession> {
    if (!this.provider) throw sandboxUnavailable('Sandbox Provider 未配置。', false);
    const config = readSandboxRuntimeConfig();
    const allowFake = this.provider instanceof FakeSandboxProvider;
    if (!allowFake && !isSandboxConfigured(config)) {
      throw sandboxUnavailable('Sandbox 未启用或配置不完整。', false);
    }
    const entry = this.entry(sessionId);
    if (entry.session) return entry.session;
    if (!entry.creating) {
      entry.creating = this.createOrReconnect(sessionId, config, entry);
    }
    try {
      entry.session = await entry.creating;
      return entry.session;
    } finally {
      entry.creating = undefined;
    }
  }

  private async createOrReconnect(
    sessionId: string,
    config: SandboxRuntimeConfig,
    entry: SessionEntry,
  ): Promise<SandboxSession> {
    const now = Date.now();
    const record = await this.instances?.findBySessionId(sessionId);
    if (record && this.provider?.connect) {
      try {
        const session = await this.provider.connect({ providerSandboxId: record.providerSandboxId });
        entry.hardExpiresAtMs = record.hardExpiresAt.getTime();
        await this.persistActive(sessionId, session.id, config, entry.hardExpiresAtMs);
        return session;
      } catch {
        await this.instances?.markStale(sessionId);
      }
    }
    if (!this.provider) throw sandboxUnavailable('Sandbox Provider 未配置。', false);
    entry.hardExpiresAtMs = now + config.maxTtlMs;
    const session = await this.provider.create({
      image: config.image!,
      ttlMs: config.ttlMs,
      metadata: { sessionId },
    });
    await this.persistActive(sessionId, session.id, config, entry.hardExpiresAtMs);
    return session;
  }

  private async persistActive(
    sessionId: string,
    providerSandboxId: string,
    config: SandboxRuntimeConfig,
    hardExpiresAtMs: number,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(Date.now() + config.ttlMs);
    const hardExpiresAt = new Date(hardExpiresAtMs);
    await this.instances?.upsertActive({
      sessionId,
      providerSandboxId,
      lastActiveAt: now,
      expiresAt,
      hardExpiresAt,
    });
  }

  async touchActivity(sessionId: string): Promise<void> {
    const config = readSandboxRuntimeConfig();
    const now = new Date();
    const expiresAt = new Date(Date.now() + config.ttlMs);
    await this.instances?.touchActivity({ sessionId, lastActiveAt: now, expiresAt });
  }

  async scheduleDestroyIfIdle(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    if (entry.runLeases.size > 0 || entry.runningJobCount > 0) return;
    const record = await this.instances?.findBySessionId(sessionId);
    const now = Date.now();
    // 无 DB 行时不应视为 TTL=0 立即销毁（否则 Run lease 释放后会丢掉 Session workspace）。
    const expiresAtMs = record?.expiresAt.getTime() ?? Number.POSITIVE_INFINITY;
    const hardMs = entry.hardExpiresAtMs || (record?.hardExpiresAt.getTime() ?? 0);
    if (now < expiresAtMs && now < hardMs) return;
    if (entry.session) await this.destroySession(sessionId, entry.session);
    this.sessions.delete(sessionId);
  }

  private async scanIdleDestroy(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) {
      await this.scheduleDestroyIfIdle(sessionId);
    }
    if (!this.instances?.enabled()) return;
    const rows = await this.instances.listActive();
    const now = Date.now();
    for (const row of rows) {
      if (this.sessions.has(row.sessionId)) continue;
      if (now >= row.expiresAt.getTime() || now >= row.hardExpiresAt.getTime()) {
        await this.instances.markStale(row.sessionId);
      }
    }
  }

  private enqueue<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    const entry = this.entry(sessionId);
    const next = entry.queue.then(work, work);
    entry.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private entry(sessionId: string): SessionEntry {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const config = readSandboxRuntimeConfig();
    const created: SessionEntry = {
      sessionId,
      queue: Promise.resolve(),
      runLeases: new Set(),
      runningJobCount: 0,
      hardExpiresAtMs: Date.now() + config.maxTtlMs,
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  private async destroySession(sessionId: string, session: SandboxSession): Promise<void> {
    try {
      await this.bounded(session.destroy());
    } catch {
      // TTL 回收兜底
    } finally {
      await this.instances?.deleteBySessionId(sessionId);
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
