import { describe, expect, it } from 'vitest';

import {
  formatBashTerminalCopyText,
  formatBashTerminalRendered,
} from '../elements/bash-terminal-panel';
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

  it('keeps full command in copy text and separates rendered output', () => {
    const terminal = {
      description: 'd',
      command: 'cat << EOF\nline1\nline2\nEOF',
      renderedOutput: 'line1\nline2',
    };
    expect(formatBashTerminalRendered(terminal, false)).toBe('line1\nline2');
    expect(formatBashTerminalCopyText(terminal, false)).toBe(
      'cat << EOF\nline1\nline2\nEOF\n\nline1\nline2',
    );
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
