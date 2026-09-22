import { describe, expect, it } from 'vitest';

import { buildBashTerminalView, renderBashResult } from '../src/sandbox/bash-render.js';

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

describe('buildBashTerminalView', () => {
  it('includes rendered output for UI terminal cards', () => {
    const view = buildBashTerminalView(
      { description: 'echo test', command: 'echo test' },
      {
        exitCode: 0,
        signal: null,
        timedOut: false,
        aborted: false,
        timeoutMs: 1_000,
        stdout: 'ok',
        stderr: '',
        durationMs: 5,
        truncated: { stdout: false, stderr: false },
      },
    );
    expect(view.renderedOutput).toContain('ok');
    expect(view.exitCode).toBe(0);
  });
});
