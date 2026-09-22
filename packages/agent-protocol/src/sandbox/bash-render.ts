import type { BashRunResult } from './contracts.js';

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
