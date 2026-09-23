import type { BashTerminalView } from '@harness/agent-protocol';
import Ansi from 'ansi-to-react';
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

const ansi = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  yellow: '\x1b[33m',
} as const;

/** 仅工具结果（stdout/stderr 等），不含 command 重复。 */
export function formatBashTerminalRendered(
  terminal: BashTerminalView,
  busy: boolean,
): string {
  if (terminal.renderedOutput?.trim()) {
    return terminal.renderedOutput.trimEnd();
  }
  if (busy) {
    return `${ansi.yellow}(命令执行中…)${ansi.reset}`;
  }
  return `${ansi.dim}(no output)${ansi.reset}`;
}

/** 复制到剪贴板：完整 command + 输出。 */
export function formatBashTerminalCopyText(
  terminal: BashTerminalView,
  busy: boolean,
): string {
  const rendered = formatBashTerminalRendered(terminal, busy);
  return `${terminal.command}\n\n${rendered}`;
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
  const copyText = useMemo(
    () => formatBashTerminalCopyText(terminal, busy),
    [terminal, busy],
  );
  const rendered = useMemo(
    () => formatBashTerminalRendered(terminal, busy),
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
      <Terminal output={copyText} isStreaming={busy} autoScroll>
        <TerminalHeader>
          <TerminalTitle>{contextLabel ?? 'sandbox'}</TerminalTitle>
          <div className="ai-terminal__header-end">
            {meta ? <span className="bash-terminal-panel__meta">{meta}</span> : null}
            <TerminalStatus />
            <TerminalActions>
              <TerminalCopyButton />
            </TerminalActions>
          </div>
        </TerminalHeader>
        <div className="ai-terminal__input-pane">
          <div className="ai-terminal__pane-label">输入</div>
          <pre className="ai-terminal__input">{terminal.command}</pre>
        </div>
        <TerminalContent>
          <div className="ai-terminal__pane-label">输出</div>
          <pre className="ai-terminal__output">
            <Ansi className="ai-terminal__ansi">{rendered}</Ansi>
          </pre>
        </TerminalContent>
      </Terminal>
    </div>
  );
}
