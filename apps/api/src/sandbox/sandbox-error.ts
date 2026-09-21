import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

export class SandboxError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string,
    readonly retryable = false,
    readonly sessionInvalidated = false,
  ) {
    super(detail);
    this.name = 'SandboxError';
  }
}

export function sandboxUnavailable(detail: string, retryable = true): SandboxError {
  return new SandboxError(AGENT_ERROR_CODES.sandboxUnavailable, detail, retryable);
}

export function sandboxStageFailed(detail: string, retryable = false): SandboxError {
  return new SandboxError(AGENT_ERROR_CODES.sandboxStageFailed, detail, retryable);
}

export function sandboxCollectFailed(detail: string, retryable = true): SandboxError {
  return new SandboxError(AGENT_ERROR_CODES.sandboxCollectFailed, detail, retryable);
}

export function sandboxExecutionUnknown(detail: string): SandboxError {
  return new SandboxError(AGENT_ERROR_CODES.sandboxExecutionUnknown, detail, false);
}

export function redactProviderError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/sk-[A-Za-z0-9]+/g, '[redacted]')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[redacted]')
    .replace(/\/(?:home|root|var|tmp)\/[^\s]+/g, '[path]');
}
