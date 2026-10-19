export const SANDBOX_WORKSPACE_ROOT = '/workspace';

/**
 * 为 true 时：network/install boost 仅放开 merged 固定白名单，且 bash 校验命令内 host。
 * 当前产品阶段固定 false（命令内 HTTPS 域名动态放行）；需收紧时在代码中改为 true。
 */
export const SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED = false;

export const sandboxEgressAllowlistV1 = [
  'example.com',
  'pypi.org',
  'files.pythonhosted.org',
  'registry.npmjs.org',
  'registry.npmmirror.com',
  'github.com',
  'codeload.github.com',
  'raw.githubusercontent.com',
] as const;

export const sandboxLimits = {
  cpu: 1,
  memoryMiB: 2048,
  diskMiB: 5120,
  pid: 256,
  ttlMs: 15 * 60_000,
  commandDefaultMs: 120_000,
  commandMaxMs: 600_000,
  commandMinMs: 1_000,
  cancellationGraceMs: 10_000,
  toolOuterTimeoutMs: 610_000,
  cleanupTimeoutMs: 10_000,
  streamMaxBytes: 32 * 1024,
  streamHeadBytes: 8 * 1024,
  streamTailBytes: 8 * 1024,
  stageMaxFiles: 10,
  stageMaxBytes: 50 * 1024 * 1024,
  collectMaxBytes: 20 * 1024 * 1024,
  publicCommandMaxCodePoints: 200,
  maxTtlMs: 2 * 60 * 60_000,
  jobMaxRunning: 8,
  jobWatcherIntervalMs: 2_000,
  jobWaitDefaultMs: 30_000,
  jobWaitMaxMs: 600_000,
  jobMaxConsecutiveWakes: 3,
  jobKillGraceMs: 5_000,
} as const;

export type SandboxJobCompletionDelivery = 'wakeup' | 'quiet';

export type SandboxRuntimeConfig = {
  enabled: boolean;
  domain?: string;
  apiKey?: string;
  image?: string;
  ttlMs: number;
  maxTtlMs: number;
  egressAllowlistExtra: readonly string[];
  jobCompletionDelivery: SandboxJobCompletionDelivery;
  jobMaxConsecutiveWakes: number;
  jobWaitDefaultMs: number;
  jobWaitMaxMs: number;
  jobMaxRunning: number;
  jobWatcherIntervalMs: number;
};

export function readSandboxRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): SandboxRuntimeConfig {
  const enabled = env.SANDBOX_ENABLED === 'true' || env.SANDBOX_ENABLED === '1';
  const ttlRaw = env.SANDBOX_TTL_MS;
  const ttlMs = ttlRaw ? Number(ttlRaw) : sandboxLimits.ttlMs;
  const maxTtlRaw = env.SANDBOX_MAX_TTL_MS;
  const maxTtlMs = maxTtlRaw ? Number(maxTtlRaw) : sandboxLimits.maxTtlMs;
  const extraRaw = env.SANDBOX_EGRESS_ALLOWLIST_EXTRA;
  const egressAllowlistExtra = extraRaw
    ? extraRaw
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const deliveryRaw = env.SANDBOX_JOB_COMPLETION_DELIVERY?.trim().toLowerCase();
  const jobCompletionDelivery: SandboxJobCompletionDelivery =
    deliveryRaw === 'quiet' ? 'quiet' : 'wakeup';
  const wakesRaw = env.SANDBOX_JOB_MAX_CONSECUTIVE_WAKES;
  const jobMaxConsecutiveWakes = wakesRaw
    ? Number(wakesRaw)
    : sandboxLimits.jobMaxConsecutiveWakes;
  const waitDefaultRaw = env.SANDBOX_JOB_WAIT_TIMEOUT_MS;
  const jobWaitDefaultMs = waitDefaultRaw
    ? Number(waitDefaultRaw)
    : sandboxLimits.jobWaitDefaultMs;
  const waitMaxRaw = env.SANDBOX_JOB_MAX_WAIT_TIMEOUT_MS;
  const jobWaitMaxMs = waitMaxRaw ? Number(waitMaxRaw) : sandboxLimits.jobWaitMaxMs;
  const jobMaxRunningRaw = env.SANDBOX_JOB_MAX_RUNNING;
  const jobMaxRunning = jobMaxRunningRaw
    ? Number(jobMaxRunningRaw)
    : sandboxLimits.jobMaxRunning;
  return {
    enabled,
    domain: emptyToUndefined(env.SANDBOX_DOMAIN),
    apiKey: emptyToUndefined(env.SANDBOX_API_KEY),
    image: emptyToUndefined(env.SANDBOX_IMAGE),
    ttlMs: Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : sandboxLimits.ttlMs,
    maxTtlMs: Number.isFinite(maxTtlMs) && maxTtlMs > 0 ? maxTtlMs : sandboxLimits.maxTtlMs,
    egressAllowlistExtra,
    jobCompletionDelivery,
    jobMaxConsecutiveWakes:
      Number.isFinite(jobMaxConsecutiveWakes) && jobMaxConsecutiveWakes > 0
        ? jobMaxConsecutiveWakes
        : sandboxLimits.jobMaxConsecutiveWakes,
    jobWaitDefaultMs:
      Number.isFinite(jobWaitDefaultMs) && jobWaitDefaultMs > 0
        ? jobWaitDefaultMs
        : sandboxLimits.jobWaitDefaultMs,
    jobWaitMaxMs:
      Number.isFinite(jobWaitMaxMs) && jobWaitMaxMs > 0
        ? jobWaitMaxMs
        : sandboxLimits.jobWaitMaxMs,
    jobMaxRunning:
      Number.isFinite(jobMaxRunning) && jobMaxRunning > 0
        ? jobMaxRunning
        : sandboxLimits.jobMaxRunning,
    jobWatcherIntervalMs: sandboxLimits.jobWatcherIntervalMs,
  };
}

export function mergedEgressAllowlist(
  config: Pick<SandboxRuntimeConfig, 'egressAllowlistExtra'> = readSandboxRuntimeConfig(),
): readonly string[] {
  const merged = new Set<string>([...sandboxEgressAllowlistV1, ...config.egressAllowlistExtra]);
  return [...merged];
}

const URL_HOST_PATTERN = /https?:\/\/([^/?#\s'"]+)/gi;

export function extractHostsFromCommand(command: string): string[] {
  const hosts = new Set<string>();
  for (const match of command.matchAll(URL_HOST_PATTERN)) {
    const raw = match[1]?.split(':')[0]?.toLowerCase();
    if (raw) hosts.add(raw.replace(/^www\./u, ''));
  }
  return [...hosts];
}

export type NetworkRulePatch = { action: 'allow'; target: string };

export function buildEgressBoostRules(input: {
  commandHosts: readonly string[];
  config?: Pick<SandboxRuntimeConfig, 'egressAllowlistExtra'>;
}): NetworkRulePatch[] {
  const config = input.config ?? readSandboxRuntimeConfig();
  if (SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED) {
    return mergedEgressAllowlist(config).map((target) => ({ action: 'allow', target }));
  }
  const targets = new Set<string>(sandboxEgressAllowlistV1);
  for (const extra of config.egressAllowlistExtra) targets.add(extra);
  for (const host of input.commandHosts) {
    const normalized = host.toLowerCase().replace(/^www\./u, '');
    if (!normalized) continue;
    targets.add(normalized);
    targets.add(`*.${normalized}`);
  }
  return [...targets].map((target) => ({ action: 'allow', target }));
}

export function isHostAllowed(host: string, allowlist: readonly string[]): boolean {
  const normalized = host.toLowerCase().replace(/^www\./u, '');
  return allowlist.some(
    (entry) => normalized === entry || normalized.endsWith(`.${entry}`),
  );
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
