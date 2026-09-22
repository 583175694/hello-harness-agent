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

  it('keeps head and tail when truncating output (legacy boundStream)', () => {
    const text = `${'H'.repeat(20_000)}${'T'.repeat(20_000)}`;
    const bounded = boundStream(text);
    expect(bounded.truncated).toBe(true);
    expect(bounded.text.startsWith('H')).toBe(true);
    expect(bounded.text.endsWith('T')).toBe(true);
    expect(bounded.text).toContain('[truncated]');
  });

  it('prefers tail when truncating model-visible output', () => {
    const text = `${'H'.repeat(20_000)}${'T'.repeat(20_000)}`;
    const bounded = boundStreamTail(text);
    expect(bounded.truncated).toBe(true);
    expect(bounded.text.startsWith('[output truncated]')).toBe(true);
    expect(bounded.text.endsWith('T')).toBe(true);
  });

  it('reuses one session per run and serializes commands', async () => {
    const provider = new FakeSandboxProvider();
    const manager = new SandboxManagerService(provider);
    const first = await manager.execute('run-1', {
      command: 'echo one',
      cwd: '/workspace',
      timeoutMs: 5_000,
    });
    const second = await manager.execute('run-1', {
      command: 'echo two',
      cwd: '/workspace',
      timeoutMs: 5_000,
    });
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(provider.sessions.size).toBe(1);
    await manager.releaseRun('run-1');
    expect([...provider.sessions.values()][0]?.destroyed).toBe(true);
  });

  it('reports nonzero exits as command results', async () => {
    const manager = new SandboxManagerService(new FakeSandboxProvider());
    const result = await manager.execute('run-2', {
      command: 'fail',
      cwd: '/workspace',
      timeoutMs: 5_000,
    });
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });
});
