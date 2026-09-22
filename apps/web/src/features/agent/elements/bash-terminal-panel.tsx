import type { BashTerminalView } from '@harness/agent-protocol';
import { summarizeCommand } from '@harness/agent-protocol';
import { useMemo } from 'react';

import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from '../../../components/ai-elements/terminal';
import type { ToolCallStatus } from '../model/types';

/** 与 AI Elements Terminal 一致的 ANSI 语义色（stdout 若自带转义码会一并渲染）。 */
const ansi = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
} as const;

export function formatBashTerminalOutput(
  terminal: BashTerminalView,
  busy: boolean,
): string {
  const commandBlock = terminal.command
    .split('\n')
    .map((line) => `${ansi.green}$${ansi.reset} ${line}`)
    .join('\n');
  if (terminal.renderedOutput?.trim()) {
    return `${commandBlock}\n\n${terminal.renderedOutput.trimEnd()}`;
  }
  if (busy) {
    return `${commandBlock}\n\n${ansi.yellow}(命令执行中…)${ansi.reset}`;
  }
  return `${commandBlock}\n\n${ansi.dim}(no output)${ansi.reset}`;
}

export function BashTerminalPanel({
  terminal,
  status,
  contextLabel,
}: {
  terminal: BashTerminalView;
  status: ToolCallStatus;
  contextLabel?: string;
}) {
  const busy = status === 'running' || status === 'cancelling';
  const output = useMemo(
    () => formatBashTerminalOutput(terminal, busy),
    [terminal, busy],
  );
  const meta =
    terminal.exitCode !== undefined && terminal.exitCode !== null
      ? `exit ${terminal.exitCode}`
      : terminal.jobId
        ? `job ${terminal.jobId}`
        : null;

  return (
    <div className="bash-terminal-panel">
      <Terminal output={output} isStreaming={busy} autoScroll>
        <TerminalHeader>
          <TerminalTitle title={terminal.command}>
            {contextLabel ?? 'sandbox'} · {summarizeCommand(terminal.command, 96)}
          </TerminalTitle>
          <div className="ai-terminal__header-end">
            {meta ? <span className="bash-terminal-panel__meta">{meta}</span> : null}
            <TerminalStatus />
            <TerminalActions>
              <TerminalCopyButton />
            </TerminalActions>
          </div>
        </TerminalHeader>
        <TerminalContent />
      </Terminal>
    </div>
  );
}
