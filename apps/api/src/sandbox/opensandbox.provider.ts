import { Sandbox, type NetworkRule } from '@alibaba-group/opensandbox';
import { buildEgressBoostRules } from './sandbox-config';
import { sandboxUnavailable, redactProviderError } from './sandbox-error';
import { boundStreamTail } from './sandbox-output';
import type { SandboxRuntimeConfig } from './sandbox-config';
import type {
  CreateSandboxInput,
  SandboxCommandInput,
  SandboxCommandResult,
  SandboxFileStat,
  SandboxProvider,
  SandboxSession,
} from './sandbox.types';

type OpenSandboxHandle = Awaited<ReturnType<typeof Sandbox.create>>;

function joinLogs(messages: ReadonlyArray<{ text: string }> | undefined): string {
  return (messages ?? []).map((message) => message.text).join('');
}

function secondsFromMs(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

function buildShellCommand(input: SandboxCommandInput): string {
  const envEntries = input.env ?? {};
  const exports = Object.entries(envEntries)
    .map(([key, value]) => `export ${key}=${JSON.stringify(value)}`)
    .join('; ');
  const body = exports ? `${exports}; ${input.command}` : input.command;
  return body;
}

export class OpenSandboxSession implements SandboxSession {
  constructor(
    readonly id: string,
    private readonly handle: OpenSandboxHandle,
  ) {}

  async execute(input: SandboxCommandInput): Promise<SandboxCommandResult> {
    const started = Date.now();
    if (input.signal?.aborted) {
      return this.interrupted(input, started, true);
    }
    const run = async (): Promise<SandboxCommandResult> => {
      try {
        const raw = await this.handle.commands.run(
          `bash -c ${JSON.stringify(buildShellCommand(input))}`,
          {
            workingDirectory: input.cwd,
            timeoutSeconds: secondsFromMs(input.timeoutMs),
          },
          undefined,
          input.signal,
        );
        if (input.signal?.aborted) return this.interrupted(input, started, true);
        const durationMs = Date.now() - started;
        const rawStdout = joinLogs(raw.logs.stdout);
        const rawStderr = joinLogs(raw.logs.stderr);
        const stdout = boundStreamTail(rawStdout);
        const stderr = boundStreamTail(rawStderr);
        const exitCode = raw.exitCode ?? null;
        const timedOut =
          durationMs >= input.timeoutMs && exitCode !== 0 && !input.signal?.aborted;
        return {
          exitCode,
          signal: null,
          timedOut,
          aborted: false,
          timeoutMs: input.timeoutMs,
          stdout: stdout.text,
          stderr: stderr.text,
          durationMs,
          truncatedStdout: stdout.truncated,
          truncatedStderr: stderr.truncated,
          ...(stdout.truncated ? { fullStdout: stdout.full } : {}),
          ...(stderr.truncated ? { fullStderr: stderr.full } : {}),
        };
      } catch (error) {
        if (input.signal?.aborted) return this.interrupted(input, started, true);
        throw sandboxUnavailable(redactProviderError(error));
      }
    };
    if (!input.egressBoost) return run();
    const rules = buildEgressBoostRules({
      commandHosts: input.egressBoostHosts ?? [],
    }) as NetworkRule[];
    const deleteTargets = rules.map((rule) => rule.target);
    try {
      await this.handle.patchEgressRules(rules);
      return await run();
    } finally {
      await this.handle.deleteEgressRules(deleteTargets).catch(() => undefined);
    }
  }

  async upload(input: { path: string; data: Uint8Array; mode?: number }): Promise<void> {
    await this.handle.files.writeFiles([
      { path: input.path, data: input.data, mode: input.mode },
    ]);
  }

  async stat(input: { path: string }): Promise<SandboxFileStat> {
    try {
      const info = await this.handle.files.getFileInfo([input.path]);
      const stat = info[input.path];
      if (!stat) return { path: input.path, kind: 'missing', size: null };
      const kind =
        stat.type === 'file'
          ? 'regular_file'
          : stat.type === 'directory'
            ? 'directory'
            : stat.type === 'symlink'
              ? 'symlink'
              : 'other';
      return { path: input.path, kind, size: stat.size ?? null };
    } catch {
      return { path: input.path, kind: 'missing', size: null };
    }
  }

  async download(input: { path: string }): Promise<Uint8Array> {
    return this.handle.files.readBytes(input.path);
  }

  async destroy(): Promise<void> {
    try {
      await this.handle.kill();
    } catch (error) {
      const message = redactProviderError(error);
      if (/not found|already/i.test(message)) return;
      throw sandboxUnavailable(message);
    } finally {
      await this.handle.close().catch(() => undefined);
    }
  }

  private interrupted(
    input: SandboxCommandInput,
    started: number,
    aborted: boolean,
  ): SandboxCommandResult {
    return {
      exitCode: null,
      signal: 'SIGTERM',
      timedOut: !aborted,
      aborted,
      timeoutMs: input.timeoutMs,
      stdout: '',
      stderr: '',
      durationMs: Date.now() - started,
    };
  }
}

export class OpenSandboxProvider implements SandboxProvider {
  constructor(private readonly config: SandboxRuntimeConfig) {}

  async connect(input: { providerSandboxId: string }): Promise<SandboxSession> {
    try {
      const handle = await Sandbox.connect({
        sandboxId: input.providerSandboxId,
        connectionConfig: {
          domain: this.config.domain,
          apiKey: this.config.apiKey,
          protocol: 'http',
          useServerProxy: true,
        },
      });
      return new OpenSandboxSession(handle.id, handle);
    } catch (error) {
      throw sandboxUnavailable(redactProviderError(error));
    }
  }

  async create(input: CreateSandboxInput): Promise<SandboxSession> {
    try {
      const handle = await Sandbox.create({
        connectionConfig: {
          domain: this.config.domain,
          apiKey: this.config.apiKey,
          protocol: 'http',
          useServerProxy: true,
        },
        image: input.image,
        timeoutSeconds: secondsFromMs(input.ttlMs),
        networkPolicy: { defaultAction: 'deny', egress: [] },
        metadata: input.metadata,
      });
      await handle.files.createDirectories([{ path: '/workspace' }]).catch(() => undefined);
      return new OpenSandboxSession(handle.id, handle);
    } catch (error) {
      throw sandboxUnavailable(redactProviderError(error));
    }
  }
}
