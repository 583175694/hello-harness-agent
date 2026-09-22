import { dirname } from 'node:path';
import { SANDBOX_WORKSPACE_ROOT, sandboxLimits } from './sandbox-config';
import { boundStreamTail } from './sandbox-output';
import type {
  CreateSandboxInput,
  SandboxCommandInput,
  SandboxCommandResult,
  SandboxFileStat,
  SandboxProvider,
  SandboxSession,
} from './sandbox.types';

type FakeFile = {
  kind: SandboxFileStat['kind'];
  data?: Uint8Array;
  mode?: number;
};

export class FakeSandboxSession implements SandboxSession {
  readonly files = new Map<string, FakeFile>();
  destroyed = false;

  constructor(readonly id: string) {
    this.files.set('/workspace', { kind: 'directory' });
  }

  async execute(input: SandboxCommandInput): Promise<SandboxCommandResult> {
    this.assertAlive();
    const started = Date.now();
    if (input.signal?.aborted) {
      return this.result(input, { exitCode: null, aborted: true, durationMs: Date.now() - started });
    }
    const abort = new Promise<SandboxCommandResult>((resolve) => {
      input.signal?.addEventListener(
        'abort',
        () =>
          resolve(
            this.result(input, {
              exitCode: null,
              aborted: true,
              durationMs: Date.now() - started,
            }),
          ),
        { once: true },
      );
    });
    const run = this.runCommand(input, started);
    return Promise.race([run, abort]);
  }

  async upload(input: { path: string; data: Uint8Array; mode?: number }): Promise<void> {
    this.assertAlive();
    this.ensureParent(input.path);
    this.files.set(input.path, { kind: 'regular_file', data: input.data, mode: input.mode });
  }

  async stat(input: { path: string }): Promise<SandboxFileStat> {
    this.assertAlive();
    const file = this.files.get(input.path);
    if (!file) return { path: input.path, kind: 'missing', size: null };
    return {
      path: input.path,
      kind: file.kind,
      size: file.data ? file.data.byteLength : null,
    };
  }

  async download(input: { path: string }): Promise<Uint8Array> {
    this.assertAlive();
    const file = this.files.get(input.path);
    if (!file || file.kind !== 'regular_file' || !file.data) {
      throw new Error('not a regular file');
    }
    return file.data;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.files.clear();
  }

  private async runCommand(
    input: SandboxCommandInput,
    started: number,
  ): Promise<SandboxCommandResult> {
    if (input.command.includes('ls -1') && input.command.includes('.harness/jobs')) {
      const prefix = `${SANDBOX_WORKSPACE_ROOT}/.harness/jobs/`;
      const ids = new Set<string>();
      for (const key of this.files.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest) continue;
        const jobId = rest.split('/')[0];
        if (jobId) ids.add(jobId);
      }
      return this.result(input, {
        exitCode: 0,
        stdout: [...ids].join('\n'),
        durationMs: Date.now() - started,
      });
    }
    if (input.command.includes('nohup bash -c')) {
      await this.runBackgroundJob(input.command);
      return this.result(input, { exitCode: 0, durationMs: Date.now() - started });
    }
    const catPath = this.parseCatPath(input.command);
    if (catPath) {
      const file = this.files.get(catPath);
      const text =
        file?.kind === 'regular_file' && file.data
          ? Buffer.from(file.data).toString('utf8')
          : '';
      return this.result(input, { exitCode: 0, stdout: text, durationMs: Date.now() - started });
    }
    if (input.command.includes("m['status']='killed'") && input.command.includes('.harness/jobs/')) {
      const jobId = input.command.match(/\.harness\/jobs\/([^/]+)/)?.[1];
      if (jobId) {
        const metaPath = `${SANDBOX_WORKSPACE_ROOT}/.harness/jobs/${jobId}/meta.json`;
        const file = this.files.get(metaPath);
        if (file?.data) {
          const meta = JSON.parse(Buffer.from(file.data).toString('utf8')) as Record<string, unknown>;
          meta.status = 'killed';
          await this.upload({
            path: metaPath,
            data: Buffer.from(JSON.stringify(meta), 'utf8'),
          });
        }
      }
      return this.result(input, { exitCode: 0, durationMs: Date.now() - started });
    }
    if (input.timeoutMs <= 0) {
      return this.result(input, { exitCode: null, timedOut: true, durationMs: Date.now() - started });
    }
    const write = input.command.match(/^write:(\S+)\s+([\s\S]+)$/);
    if (write) {
      await this.upload({ path: write[1]!, data: Buffer.from(write[2]!) });
      return this.result(input, { exitCode: 0, stdout: 'ok', durationMs: Date.now() - started });
    }
    if (input.command === 'fail') {
      return this.result(input, {
        exitCode: 1,
        stderr: 'command failed',
        durationMs: Date.now() - started,
      });
    }
    if (input.command.startsWith('sleep:')) {
      const ms = Number(input.command.slice(6));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(ms) ? ms : 0));
      if (input.signal?.aborted) {
        return this.result(input, { exitCode: null, aborted: true, durationMs: Date.now() - started });
      }
      if (Date.now() - started >= input.timeoutMs) {
        return this.result(input, { exitCode: null, timedOut: true, durationMs: Date.now() - started });
      }
    }
    return this.result(input, {
      exitCode: 0,
      stdout: `ran:${input.command} cwd:${input.cwd}`,
      durationMs: Date.now() - started,
    });
  }

  private result(
    input: SandboxCommandInput,
    partial: Partial<SandboxCommandResult> & { durationMs: number },
  ): SandboxCommandResult {
    const stdout = boundStreamTail(partial.stdout ?? '');
    const stderr = boundStreamTail(partial.stderr ?? '');
    return {
      exitCode: partial.exitCode ?? null,
      signal: partial.signal ?? null,
      timedOut: partial.timedOut ?? false,
      aborted: partial.aborted ?? false,
      timeoutMs: input.timeoutMs,
      stdout: stdout.text,
      stderr: stderr.text,
      durationMs: partial.durationMs,
      truncatedStdout: stdout.truncated,
      truncatedStderr: stderr.truncated,
      ...(stdout.truncated ? { fullStdout: stdout.full } : {}),
      ...(stderr.truncated ? { fullStderr: stderr.full } : {}),
    };
  }

  private parseCatPath(command: string): string | undefined {
    if (!command.startsWith('cat ')) return undefined;
    const pathPart = command.slice(4).split(' 2>/dev/null')[0]?.trim();
    if (!pathPart) return undefined;
    try {
      return JSON.parse(pathPart) as string;
    } catch {
      return undefined;
    }
  }

  private ensureParent(path: string): void {
    const parent = dirname(path);
    if (parent === path) return;
    if (!this.files.has(parent)) this.files.set(parent, { kind: 'directory' });
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('sandbox destroyed');
  }

  private async runBackgroundJob(command: string): Promise<void> {
    const jobMatch = command.match(/\.harness\/jobs\/([^/]+)/);
    const jobId = jobMatch?.[1];
    if (!jobId) return;
    const jobDir = `/workspace/.harness/jobs/${jobId}`;
    this.ensureParent(jobDir);
    this.files.set(`${SANDBOX_WORKSPACE_ROOT}/.harness`, { kind: 'directory' });
    this.files.set(`${SANDBOX_WORKSPACE_ROOT}/.harness/jobs`, { kind: 'directory' });
    this.files.set(jobDir, { kind: 'directory' });
    await this.upload({
      path: `${jobDir}/meta.json`,
      data: Buffer.from(
        JSON.stringify({
          jobId,
          command: '',
          description: '',
          startedAt: new Date().toISOString(),
          status: 'running',
        }),
        'utf8',
      ),
    });
    const innerMatch = command.match(/nohup bash -c (.+?) >>/);
    const inner = innerMatch?.[1];
    if (!inner) return;
    const decoded = inner.startsWith('"') ? JSON.parse(inner) : inner;
    const sleepMatch = String(decoded).match(/sleep(?::|\s+)(\d+)/);
    const delayMs = sleepMatch ? Number(sleepMatch[1]) * 1000 : 10;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 200)));
    const exitCode = String(decoded).includes('fail') ? 1 : 0;
    await this.upload({
      path: `${jobDir}/exit_code`,
      data: Buffer.from(String(exitCode), 'utf8'),
    });
    const metaRaw = this.files.get(`${jobDir}/meta.json`)?.data;
    if (metaRaw) {
      const meta = JSON.parse(Buffer.from(metaRaw).toString('utf8')) as Record<string, unknown>;
      meta.status = exitCode === 0 ? 'completed' : 'failed';
      meta.exitCode = exitCode;
      await this.upload({
        path: `${jobDir}/meta.json`,
        data: Buffer.from(JSON.stringify(meta), 'utf8'),
      });
    }
    await this.upload({
      path: `${jobDir}/stdout.log`,
      data: Buffer.from(`ran:${decoded}\n`, 'utf8'),
    });
  }
}

export class FakeSandboxProvider implements SandboxProvider {
  readonly sessions = new Map<string, FakeSandboxSession>();

  async create(input: CreateSandboxInput): Promise<SandboxSession> {
    const id = `fake-${crypto.randomUUID()}`;
    const session = new FakeSandboxSession(id);
    this.sessions.set(id, session);
    void input.ttlMs;
    void sandboxLimits.ttlMs;
    return session;
  }

  async connect(input: { providerSandboxId: string }): Promise<SandboxSession> {
    const session = this.sessions.get(input.providerSandboxId);
    if (!session || session.destroyed) throw new Error('sandbox not found');
    return session;
  }
}
