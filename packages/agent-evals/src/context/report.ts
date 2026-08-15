import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContextExperimentReport, ContextTrialResult } from './types.js';

export async function writeContextReport(
  directory: string,
  report: ContextExperimentReport,
  manifest: Record<string, unknown>,
  comparePath?: string,
): Promise<void> {
  await mkdir(join(directory, 'trials'), { recursive: true });
  await mkdir(join(directory, 'traces'), { recursive: true });
  for (const trial of report.trials) {
    const name = `${trial.taskId}-${trial.trialIndex}.json`;
    await writeFile(join(directory, 'trials', name), json(trial), 'utf8');
    await writeFile(join(directory, 'traces', name), json(trial.runs), 'utf8');
  }
  await writeFile(join(directory, 'manifest.json'), json(manifest), 'utf8');
  await writeFile(join(directory, 'summary.json'), json(report), 'utf8');
  await writeFile(join(directory, 'summary.md'), markdown(report), 'utf8');
  await writeFile(join(directory, 'human-review.csv'), humanReview(report.trials), 'utf8');
  const comparison = comparePath
    ? compareContextReports(
        report,
        JSON.parse(await readFile(comparePath, 'utf8')) as ContextExperimentReport,
      )
    : { compared: false };
  await writeFile(join(directory, 'comparison.json'), json(comparison), 'utf8');
  await writeFile(join(directory, 'comparison.md'), comparisonMarkdown(comparison), 'utf8');
}

export function compareContextReports(
  current: ContextExperimentReport,
  baseline: ContextExperimentReport,
): unknown {
  for (const field of [
    'benchmarkVersion',
    'benchmarkHash',
    'graderVersion',
    'fixtureHash',
    'model',
    'reasoningEffort',
    'systemPromptHash',
    'toolSchemaHash',
    'seed',
    'trialsPerTask',
  ] as const)
    if (baseline[field] !== current[field])
      throw new Error(`不可比较：${field} 不一致（${baseline[field]} != ${current[field]}）`);
  const profile = JSON.stringify(baseline.modelContextProfile);
  if (profile !== JSON.stringify(current.modelContextProfile))
    throw new Error('不可比较：Model Context Profile 不一致。');
  if (JSON.stringify(baseline.judgeProfile) !== JSON.stringify(current.judgeProfile))
    throw new Error('不可比较：Context Judge Profile 不一致。');
  return {
    compared: true,
    baselineExperimentId: baseline.experimentId,
    candidateExperimentId: current.experimentId,
    passRateDelta: current.summary.passRate - baseline.summary.passRate,
    passPowerKDelta: current.summary.passPowerK - baseline.summary.passPowerK,
    criticalViolationDelta:
      current.summary.criticalViolations - baseline.summary.criticalViolations,
    metricDeltas: {
      promptTokens: subtractNullable(
        current.summary.metrics.promptTokens,
        baseline.summary.metrics.promptTokens,
      ),
      completionTokens: subtractNullable(
        current.summary.metrics.completionTokens,
        baseline.summary.metrics.completionTokens,
      ),
      cachedTokens: subtractNullable(
        current.summary.metrics.cachedTokens,
        baseline.summary.metrics.cachedTokens,
      ),
      estimatedPromptTokens:
        current.summary.metrics.estimatedPromptTokens -
        baseline.summary.metrics.estimatedPromptTokens,
      modelRounds: current.summary.metrics.modelRounds - baseline.summary.metrics.modelRounds,
      toolCalls: current.summary.metrics.toolCalls - baseline.summary.metrics.toolCalls,
      duplicateToolCalls:
        current.summary.metrics.duplicateToolCalls - baseline.summary.metrics.duplicateToolCalls,
      averageTtftMs: subtractNullable(
        current.summary.metrics.averageTtftMs,
        baseline.summary.metrics.averageTtftMs,
      ),
      durationMs: current.summary.metrics.durationMs - baseline.summary.metrics.durationMs,
    },
    tasks: current.trials.map((trial) => {
      const previous = baseline.trials.find(
        (item) => item.taskId === trial.taskId && item.trialIndex === trial.trialIndex,
      );
      return {
        taskId: trial.taskId,
        trialIndex: trial.trialIndex,
        baselinePassed: previous?.passed ?? null,
        candidatePassed: trial.passed,
        changed: previous ? previous.passed !== trial.passed : null,
        promptTokenDelta:
          previous && trial.metrics.promptTokens !== null && previous.metrics.promptTokens !== null
            ? trial.metrics.promptTokens - previous.metrics.promptTokens
            : null,
        ttftDeltaMs:
          previous && trial.metrics.ttftMs !== null && previous.metrics.ttftMs !== null
            ? trial.metrics.ttftMs - previous.metrics.ttftMs
            : null,
        durationDeltaMs: previous ? trial.durationMs - previous.durationMs : null,
      };
    }),
  };
}

function markdown(report: ContextExperimentReport): string {
  const lines = [
    `# Context Engineering Eval ${report.experimentId}`,
    '',
    `- Benchmark: ${report.benchmarkVersion}`,
    `- Fixture: ${report.fixtureHash}`,
    `- Trials: ${report.summary.passed}/${report.summary.trials}`,
    `- Pass rate: ${(report.summary.passRate * 100).toFixed(1)}%`,
    `- pass@k: ${(report.summary.passAtK * 100).toFixed(1)}%`,
    `- pass^k: ${(report.summary.passPowerK * 100).toFixed(1)}%`,
    `- Critical violations: ${report.summary.criticalViolations}`,
    `- Bootstrap 95% CI: ${(report.summary.bootstrap95.low * 100).toFixed(1)}%–${(report.summary.bootstrap95.high * 100).toFixed(1)}%`,
    `- Prompt tokens: ${report.summary.metrics.promptTokens ?? 'N/A'}`,
    `- Completion tokens: ${report.summary.metrics.completionTokens ?? 'N/A'}`,
    `- Cached tokens: ${report.summary.metrics.cachedTokens ?? 'N/A'}`,
    `- Model rounds / Tool calls: ${report.summary.metrics.modelRounds} / ${report.summary.metrics.toolCalls}`,
    `- Average TTFT: ${report.summary.metrics.averageTtftMs?.toFixed(0) ?? 'N/A'}ms`,
    `- Judge tokens: ${report.summary.metrics.judgePromptTokens} prompt / ${report.summary.metrics.judgeCompletionTokens} completion`,
    '',
    '| Group | Key | Passed | Trials | Pass rate |',
    '| --- | --- | ---: | ---: | ---: |',
    ...report.summary.groups.map(
      (group) =>
        `| ${group.dimension} | ${group.key} | ${group.passed} | ${group.trials} | ${(group.passRate * 100).toFixed(1)}% |`,
    ),
    '',
    '| Task | Trial | Capability | Pressure | Result | Critical | Rounds | Tools | Prompt Tokens | TTFT |',
    '| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const trial of report.trials)
    lines.push(
      `| ${trial.taskId} | ${trial.trialIndex} | ${trial.capability} | ${trial.pressure} | ${trial.passed ? 'PASS' : 'FAIL'} | ${trial.criticalViolations} | ${trial.metrics.modelRounds} | ${trial.metrics.toolCalls} | ${trial.metrics.promptTokens ?? 'N/A'} | ${trial.metrics.ttftMs?.toFixed(0) ?? 'N/A'}ms |`,
    );
  return `${lines.join('\n')}\n`;
}

function humanReview(trials: ContextTrialResult[]): string {
  const selected = new Map(
    trials
      .filter((trial) => !trial.passed || trial.judge?.verdict !== 'pass' || trial.judgeError)
      .map((trial) => [`${trial.taskId}:${trial.trialIndex}`, trial]),
  );
  for (const capability of [...new Set(trials.map((trial) => trial.capability))]) {
    const sample = trials
      .filter((trial) => trial.capability === capability)
      .sort((left, right) =>
        `${left.taskId}:${left.trialIndex}`.localeCompare(`${right.taskId}:${right.trialIndex}`),
      )[0];
    if (sample) selected.set(`${sample.taskId}:${sample.trialIndex}`, sample);
  }
  const target = Math.ceil(trials.length * 0.2);
  for (const trial of [...trials].sort(
    (left, right) =>
      stableNumber(`${left.taskId}:${left.trialIndex}`) -
      stableNumber(`${right.taskId}:${right.trialIndex}`),
  )) {
    if (selected.size >= target) break;
    selected.set(`${trial.taskId}:${trial.trialIndex}`, trial);
  }
  const rows = [
    [
      'taskId',
      'trialIndex',
      'capability',
      'pressure',
      'passed',
      'criticalViolations',
      'answer',
      'failedRules',
      'judgeVerdict',
      'judgeReason',
      '人工结论',
      '人工备注',
    ],
    ...[...selected.values()].map((trial) => [
      trial.taskId,
      String(trial.trialIndex),
      trial.capability,
      trial.pressure,
      String(trial.passed),
      String(trial.criticalViolations),
      trial.answer ?? '',
      trial.rules
        .filter((rule) => !rule.passed)
        .map((rule) => `${rule.id}:${rule.detail}`)
        .join(' | '),
      trial.judge?.verdict ?? '',
      trial.judge?.reason ?? trial.judgeError ?? '',
      '',
      '',
    ]),
  ];
  return `${rows.map((row) => row.map(csv).join(',')).join('\n')}\n`;
}

function stableNumber(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function comparisonMarkdown(value: unknown): string {
  const comparison = value as {
    compared?: boolean;
    passRateDelta?: number;
    criticalViolationDelta?: number;
    metricDeltas?: Record<string, number | null>;
  };
  if (!comparison.compared) return '# Context Eval Comparison\n\n未指定 Baseline。\n';
  const metrics = Object.entries(comparison.metricDeltas ?? {}).map(
    ([key, delta]) => `- ${key}: ${delta ?? 'N/A'}`,
  );
  return `# Context Eval Comparison\n\n- Pass rate delta: ${((comparison.passRateDelta ?? 0) * 100).toFixed(1)}%\n- Critical violation delta: ${comparison.criticalViolationDelta ?? 0}\n${metrics.join('\n')}\n`;
}

function subtractNullable(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const csv = (value: string): string => `"${value.replaceAll('"', '""')}"`;
