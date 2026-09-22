export type CreateSandboxInput = {
  image: string;
  ttlMs: number;
  env?: Record<string, string>;
  metadata?: Record<string, string>;
};

export type SandboxCommandInput = {
  command: string;
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
  egressBoost?: boolean;
};

export type SandboxCommandResult = {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  aborted: boolean;
  timeoutMs: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncatedStdout?: boolean;
  truncatedStderr?: boolean;
  fullStdout?: string;
  fullStderr?: string;
};

export type SandboxFileStat = {
  path: string;
  kind: 'regular_file' | 'directory' | 'symlink' | 'other' | 'missing';
  size: number | null;
};

export interface SandboxSession {
  readonly id: string;
  execute(input: SandboxCommandInput): Promise<SandboxCommandResult>;
  upload(input: { path: string; data: Uint8Array; mode?: number }): Promise<void>;
  stat(input: { path: string }): Promise<SandboxFileStat>;
  download(input: { path: string }): Promise<Uint8Array>;
  destroy(input?: { signal?: AbortSignal }): Promise<void>;
}

export interface SandboxProvider {
  create(input: CreateSandboxInput): Promise<SandboxSession>;
}

export const SANDBOX_PROVIDER = Symbol('SANDBOX_PROVIDER');
