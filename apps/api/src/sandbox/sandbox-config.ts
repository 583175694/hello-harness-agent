export const SANDBOX_WORKSPACE_ROOT = '/workspace';

export const sandboxLimits = {
  cpu: 1,
  memoryMiB: 2048,
  diskMiB: 5120,
  pid: 256,
  ttlMs: 15 * 60_000,
  commandDefaultMs: 30_000,
  commandMaxMs: 120_000,
  commandMinMs: 1_000,
  cancellationGraceMs: 10_000,
  toolOuterTimeoutMs: 130_000,
  cleanupTimeoutMs: 10_000,
  streamMaxBytes: 32 * 1024,
  streamHeadBytes: 8 * 1024,
  streamTailBytes: 8 * 1024,
  stageMaxFiles: 10,
  stageMaxBytes: 50 * 1024 * 1024,
  collectMaxBytes: 20 * 1024 * 1024,
  publicCommandMaxCodePoints: 200,
} as const;

export type SandboxRuntimeConfig = {
  enabled: boolean;
  domain?: string;
  apiKey?: string;
  image?: string;
  ttlMs: number;
};

export function readSandboxRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): SandboxRuntimeConfig {
  const enabled = env.SANDBOX_ENABLED === 'true' || env.SANDBOX_ENABLED === '1';
  const ttlRaw = env.SANDBOX_TTL_MS;
  const ttlMs = ttlRaw ? Number(ttlRaw) : sandboxLimits.ttlMs;
  return {
    enabled,
    domain: emptyToUndefined(env.SANDBOX_DOMAIN),
    apiKey: emptyToUndefined(env.SANDBOX_API_KEY),
    image: emptyToUndefined(env.SANDBOX_IMAGE),
    ttlMs: Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : sandboxLimits.ttlMs,
  };
}

export function isSandboxConfigured(config: SandboxRuntimeConfig): boolean {
  return Boolean(
    config.enabled && config.domain && config.apiKey && config.image && config.image.includes('@'),
  );
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
