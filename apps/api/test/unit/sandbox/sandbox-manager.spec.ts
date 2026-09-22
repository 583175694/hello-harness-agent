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

  it('reuses one sandbox session per sessionId across runs', async () => {
    const provider = new FakeSandboxProvider();
    const manager = new SandboxManagerService(provider, undefined);
    manager.acquireRunLease('session-1', 'run-1');
    await manager.execute('session-1', {
      command: 'echo one',
      cwd: '/workspace',
      timeoutMs: 5_000,
    });
    manager.acquireRunLease('session-1', 'run-2');
    await manager.execute('session-1', {
      command: 'echo two',
      cwd: '/workspace',
      timeoutMs: 5_000,
    });
    expect(provider.sessions.size).toBe(1);
    await manager.releaseRunLease('run-1');
    expect(provider.sessions.size).toBe(1);
    expect([...provider.sessions.values()][0]?.destroyed).toBe(false);
    await manager.releaseRunLease('run-2');
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
