import { dirname } from 'node:path';
import { sandboxLimits } from './sandbox-config';
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

  private ensureParent(path: string): void {
    const parent = dirname(path);
    if (parent === path) return;
    if (!this.files.has(parent)) this.files.set(parent, { kind: 'directory' });
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('sandbox destroyed');
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
}
