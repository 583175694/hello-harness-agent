import { describe, expect, it } from 'vitest';

import { FakeSandboxProvider } from '../../../src/sandbox/fake-sandbox.provider';
import { SandboxManagerService } from '../../../src/sandbox/sandbox-manager.service';
import { resolveWorkspacePath } from '../../../src/sandbox/sandbox-path';
import { boundStream, boundStreamTail } from '../../../src/sandbox/sandbox-output';

describe('sandbox manager', () => {
  it('resolves workspace-relative paths and rejects escapes', () => {
    expect(resolveWorkspacePath('.')).toBe('/workspace');
    expect(resolveWorkspacePath('out/a.txt')).toBe('/workspace/out/a.txt');
    expect(() => resolveWorkspacePath('../etc')).toThrow();
    expect(() => resolveWorkspacePath('/tmp')).toThrow();
  });

  it('prefers tail when truncating model-visible output', () => {
    const text = `${'H'.repeat(20_000)}${'T'.repeat(20_000)}`;
    const bounded = boundStreamTail(text);
    expect(bounded.truncated).toBe(true);
    expect(bounded.text.startsWith('[output truncated]')).toBe(true);
    expect(bounded.text.endsWith('T')).toBe(true);
  });

  it('reuses one sandbox session across runs and keeps it alive between run leases', async () => {
    const provider = new FakeSandboxProvider();
    const manager = new SandboxManagerService(provider, undefined);
    const sessionId = 'session-reuse';
    manager.acquireRunLease(sessionId, 'run-1');
    await manager.execute(sessionId, {
      command: 'echo one',
      cwd: '/workspace',
      timeoutMs: 5_000,
    });
    manager.acquireRunLease(sessionId, 'run-2');
    await manager.execute(sessionId, {
      command: 'echo two',
      cwd: '/workspace',
      timeoutMs: 5_000,
    });
    expect(provider.sessions.size).toBe(1);
    await manager.releaseRunLease('run-1');
    expect(provider.sessions.size).toBe(1);
    expect([...provider.sessions.values()][0]?.destroyed).toBe(false);
    await manager.releaseRunLease('run-2');
    expect(provider.sessions.size).toBe(1);
    expect([...provider.sessions.values()][0]?.destroyed).toBe(false);

    manager.acquireRunLease(sessionId, 'run-3');
    const result = await manager.execute(sessionId, {
      command: 'echo again',
      cwd: '/workspace',
      timeoutMs: 5_000,
    });
    expect(result.exitCode).toBe(0);
    expect(provider.sessions.size).toBe(1);
    expect([...provider.sessions.values()][0]?.destroyed).toBe(false);
  });

  it('reports nonzero exits as command results', async () => {
    const manager = new SandboxManagerService(new FakeSandboxProvider(), undefined);
    const result = await manager.execute('session-2', {
      command: 'fail',
      cwd: '/workspace',
      timeoutMs: 5_000,
    });
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });
});
