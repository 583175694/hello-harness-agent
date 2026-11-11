import type { AssistantToolActivityBlock, BashTerminalView } from '@harness/agent-protocol';

import type { ToolCopyInput } from './tool-copy';

export function isBashTransparentTool(
  block: Pick<AssistantToolActivityBlock, 'toolName' | 'presentation'>,
): boolean {
  return block.toolName === 'bash' || block.presentation === 'terminal';
}

/** DSH 式 CoT 单行：`Bash · {description}` */
export function bashCoTLabel(
  block: Partial<Pick<AssistantToolActivityBlock, 'description' | 'terminalView' | 'summary' | 'title'>>,
): string {
  const description =
    block.description?.trim() ||
    block.terminalView?.description.trim() ||
    block.summary?.trim() ||
    block.title;
  return `Bash · ${description}`;
}

export function bashTerminalFromInput(input: ToolCopyInput): BashTerminalView | undefined {
  if (!input.description?.trim() || !input.command?.trim()) return undefined;
  return {
    description: input.description.trim(),
    command: input.command,
    ...(input.workdir ? { workdir: input.workdir } : {}),
  };
}

export function bashWorkbenchTitle(input: ToolCopyInput): string {
  const terminal = bashTerminalFromInput(input);
  return terminal
    ? bashCoTLabel({ description: terminal.description, terminalView: terminal, title: 'Bash' })
    : 'Bash';
}

export function mergeBashTerminalView(
  current: BashTerminalView | undefined,
  next: BashTerminalView | undefined,
): BashTerminalView | undefined {
  if (!current && !next) return undefined;
  if (!current) return next;
  if (!next) return current;
  return {
    ...current,
    ...next,
    ...(next.renderedOutput ? { renderedOutput: next.renderedOutput } : {}),
    ...(next.exitCode !== undefined ? { exitCode: next.exitCode } : {}),
    ...(next.exitSignal !== undefined ? { exitSignal: next.exitSignal } : {}),
    ...(next.jobId ? { jobId: next.jobId } : {}),
  };
}
