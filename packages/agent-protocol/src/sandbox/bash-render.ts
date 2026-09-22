import type {
  BashBackgroundResult,
  BashInputSummary,
  BashRunResult,
  BashTerminalView,
} from './contracts.js';
import { BASH_TERMINAL_RENDERED_OUTPUT_MAX } from './contracts.js';

const TRUNCATION_LINE =
  /^(\[output truncated; full output: artifact:[^\]]+\])$/u;

export function renderBashResult(result: BashRunResult): string {
  const lines: string[] = [];
  const stdout = result.stdout.trimEnd();
  const stderr = result.stderr.trimEnd();
  if (stdout) lines.push(stdout);
  if (stderr) {
    if (lines.length) lines.push('');
    lines.push('[stderr]');
    lines.push(stderr);
  }
  if (!stdout && !stderr) lines.push('(no output)');
  if (result.timedOut) {
    lines.push(`[timed out after ${Math.round(result.timeoutMs / 1000)}s]`);
  } else if (result.aborted) {
    lines.push('[command aborted]');
  } else if (result.signal) {
    lines.push(`[signal: ${result.signal}]`);
  }
  if (
    !result.timedOut &&
    !result.aborted &&
    result.exitCode !== null &&
    result.exitCode !== 0
  ) {
    lines.push(`[exit code: ${result.exitCode}]`);
  }
  return lines.join('\n');
}

export function spillReferenceLine(artifactId: string): string {
  return `[output truncated; full output: artifact:${artifactId}]`;
}

export function isSpillReferenceLine(line: string): boolean {
  return TRUNCATION_LINE.test(line.trim());
}

export function renderBashBackgroundResult(result: BashBackgroundResult): string {
  return `started background job ${result.jobId}`;
}

export function capBashTerminalRenderedOutput(text: string): string {
  const points = [...text];
  if (points.length <= BASH_TERMINAL_RENDERED_OUTPUT_MAX) return text;
  return `${points.slice(0, BASH_TERMINAL_RENDERED_OUTPUT_MAX).join('')}…`;
}

export function buildBashTerminalView(
  input: Pick<BashInputSummary, 'description' | 'command' | 'workdir'>,
  result?: BashRunResult | BashBackgroundResult,
): BashTerminalView {
  const base: BashTerminalView = {
    description: input.description,
    command: input.command,
    ...(input.workdir ? { workdir: input.workdir } : {}),
  };
  if (!result) return base;
  if ('kind' in result && result.kind === 'background') {
    return {
      ...base,
      jobId: result.jobId,
      renderedOutput: capBashTerminalRenderedOutput(renderBashBackgroundResult(result)),
    };
  }
  const run = result as BashRunResult;
  return {
    ...base,
    exitCode: run.exitCode,
    exitSignal: run.signal,
    renderedOutput: capBashTerminalRenderedOutput(renderBashResult(run)),
  };
}

export function renderJobOutputText(input: {
  stdout: string;
  stderr: string;
  status: string;
  hadNewOutput: boolean;
}): string {
  const lines: string[] = [];
  const stdout = input.stdout.trimEnd();
  const stderr = input.stderr.trimEnd();
  if (stdout) lines.push(stdout);
  if (stderr) {
    if (lines.length) lines.push('');
    lines.push('[stderr]');
    lines.push(stderr);
  }
  if (!stdout && !stderr) {
    lines.push(input.hadNewOutput ? '(no output)' : '(no new output)');
  }
  lines.push(`[status: ${input.status}]`);
  return lines.join('\n');
}

export function renderJobListText(jobs: ReadonlyArray<{ id: string; status: string; description?: string }>): string {
  if (!jobs.length) return '(no background jobs)';
  return jobs
    .map((job) => {
      const desc = job.description ? ` · ${job.description}` : '';
      return `${job.id} [${job.status}]${desc}`;
    })
    .join('\n');
}

export function renderJobKillText(jobId: string, status: string): string {
  return `job ${jobId} [status: ${status}]`;
}
