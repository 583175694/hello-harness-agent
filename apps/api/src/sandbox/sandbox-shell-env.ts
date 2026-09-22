export function sandboxTerminalEnv(): Record<string, string> {
  return {
    NO_COLOR: '1',
    TERM: 'dumb',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
    HARNESS_SHELL: '1',
  };
}

export function sandboxBrowserSessionName(sessionId: string): string {
  return `harness-${sessionId}`;
}

export function sandboxSessionEnv(sessionId: string): Record<string, string> {
  const browserSession = sandboxBrowserSessionName(sessionId);
  return {
    HARNESS_SESSION_ID: sessionId,
    AGENT_BROWSER_SESSION: browserSession,
    AGENT_BROWSER_SESSION_NAME: browserSession,
  };
}

export function mergeSandboxExecuteEnv(
  sessionId: string,
  base: Record<string, string>,
): Record<string, string> {
  return { ...base, ...sandboxSessionEnv(sessionId) };
}

/** 供容器内嵌 `bash -c`（如 background job inner）显式注入 env。 */
export function sandboxEnvExportShell(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `export ${key}=${JSON.stringify(value)}`)
    .join('; ');
}
