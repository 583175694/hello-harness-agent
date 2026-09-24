import type { BashTerminalView } from '@harness/agent-protocol';

export function formatBashTerminalOutput(terminal: BashTerminalView, busy: boolean): string {
  const commandBlock = terminal.command
    .split('\n')
    .map((line) => `$ ${line}`)
    .join('\n');
  if (terminal.renderedOutput?.trim()) {
    return `${commandBlock}\n\n${terminal.renderedOutput.trimEnd()}`;
  }
  if (busy) return `${commandBlock}\n\n(命令执行中…)`;
  return `${commandBlock}\n\n(no output)`;
}
