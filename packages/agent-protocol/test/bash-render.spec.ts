import { describe, expect, it } from 'vitest';

import { renderBashResult } from '../src/sandbox/bash-render.js';

describe('renderBashResult', () => {
  it('renders stdout, stderr and exit code markers', () => {
    const text = renderBashResult({
      exitCode: 42,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: 30_000,
      stdout: 'hello',
      stderr: 'warn',
      durationMs: 10,
      truncated: { stdout: false, stderr: false },
    });
    expect(text).toContain('hello');
    expect(text).toContain('[stderr]');
    expect(text).toContain('warn');
    expect(text).toContain('[exit code: 42]');
  });

  it('renders empty output placeholder', () => {
    expect(
      renderBashResult({
        exitCode: 0,
        signal: null,
        timedOut: false,
        aborted: false,
        timeoutMs: 30_000,
        stdout: '',
        stderr: '',
        durationMs: 1,
        truncated: { stdout: false, stderr: false },
      }),
    ).toContain('(no output)');
  });
});
