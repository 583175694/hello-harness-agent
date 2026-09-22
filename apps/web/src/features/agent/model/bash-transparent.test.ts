import { describe, expect, it } from 'vitest';

import { formatBashTerminalOutput } from '../elements/bash-terminal-panel';
import { bashCoTLabel, mergeBashTerminalView } from './bash-transparent';

describe('bash transparent copy', () => {
  it('formats CoT label like DSH', () => {
    expect(
      bashCoTLabel({
        title: 'Bash',
        description: 'Check current system date',
      }),
    ).toBe('Bash · Check current system date');
  });

  it('formats command and output for AI Elements Terminal', () => {
    const formatted = formatBashTerminalOutput(
      { description: 'd', command: 'echo hi', renderedOutput: 'hi' },
      false,
    );
    expect(formatted).toContain('echo hi');
    expect(formatted).toContain('hi');
    expect(formatted).toContain('\x1b[32m$');
  });

  it('merges terminal output on completion', () => {
    expect(
      mergeBashTerminalView(
        { description: 'd', command: 'echo hi' },
        { description: 'd', command: 'echo hi', renderedOutput: 'hi\n', exitCode: 0 },
      ),
    ).toMatchObject({ renderedOutput: 'hi\n', exitCode: 0 });
  });
});
