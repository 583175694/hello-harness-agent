import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { EvalApiClient } from '../api-client.js';
import { resolveWorkspaceEnvironmentPath } from '../cli.js';
import { CONTEXT_CORE_V1, selectContextTasks } from './cases.js';
import { DeepSeekTokenizer } from './deepseek-tokenizer.js';
import { writeContextReport } from './report.js';
import { runContextTrial, type ContextJudge } from './scenario-runner.js';
import { bootstrapTaskPassRate, summarizePasses } from './statistics.js';
import type { ContextCapability, ContextExperimentReport, ContextPressure } from './types.js';

export type ContextRunnerOptions = {
  mode: 'smoke' | 'full' | 'baseline';
  apiBaseUrl: string;
  outputDirectory: string;
  trials: number;
  seed: number;
  keepSessions: boolean;
  skipJudge: boolean;
  model: string;
  reasoningEffort: 'off' | 'low' | 'high' | 'max';
  caseId?: string;
  capability?: ContextCapability;
  pressure?: ContextPressure;
  comparePath?: string;
  command: string[];
};

const fallbackContextProfile = {
  contextWindowTokens: 131_072,
  maxOutputTokens: 8_192,
  tokenizer: 'deepseek-v3' as const,
  source: 'P0 development default; verify against the active provider before baseline',
  verified: false,
};

export async function runContextEvaluation(
  options: ContextRunnerOptions,
  dependencies: { api?: EvalApiClient; judge?: ContextJudge } = {},
): Promise<ContextExperimentReport> {
  if (!options.skipJudge && !dependencies.judge)
    throw new Error('Context Judge 未提供；请配置 Judge 或显式设置 skipJudge。');
  const api = dependencies.api ?? new EvalApiClient(options.apiBaseUrl);
  const workspace = dirname(resolveWorkspaceEnvironmentPath());
  const fixtureRoot = join(workspace, 'packages/agent-evals/fixtures/context-v1');
  const fixtureHash = await hashFixtureDirectory(fixtureRoot);
  const benchmarkHash = sha256(JSON.stringify(CONTEXT_CORE_V1));
  const systemPromptPath = join(workspace, 'apps/api/src/chat/chat.constants.ts');
  const systemPromptHash = sha256(await readFile(systemPromptPath, 'utf8'));
  const toolSchemaHash = sha256(
    (
      await Promise.all(
        [
          'apps/api/src/tools/tool-catalog.ts',
          'apps/api/src/tools/web-search.tool.ts',
          'apps/api/src/tools/web-fetch.tool.ts',
          'packages/agent-protocol/src/common/constants.ts',
          'packages/agent-protocol/src/web-fetch/contracts.ts',
        ].map((path) => readFile(join(workspace, path), 'utf8')),
      )
    ).join('\n---tool-contract---\n'),
  );
  await api.assertReady(AbortSignal.timeout(10_000));
  await api.assertFixture(fixtureHash, AbortSignal.timeout(10_000));
  const publicConfig = await api.getPublicConfig(AbortSignal.timeout(10_000));
  const contextProfile =
    publicConfig.models.find((model) => model.id === options.model)?.context ??
    fallbackContextProfile;
  if (options.mode === 'baseline' && !contextProfile.verified)
    throw new Error('正式 Baseline 已阻止：Model Context Profile 尚未验证。');
  const tasks = selectContextTasks({
    smoke: options.mode === 'smoke',
    ...(options.caseId ? { caseId: options.caseId } : {}),
    ...(options.capability ? { capability: options.capability } : {}),
    ...(options.pressure ? { pressure: options.pressure } : {}),
  });
  const tokenizer = await DeepSeekTokenizer.load(
    join(workspace, 'artifacts/tokenizers/deepseek-v3'),
  ).catch(() => {
    throw new Error('DeepSeek Tokenizer 未安装，请先运行 pnpm setup:tokenizer。');
  });
  const startedAt = new Date();
  const experimentId = startedAt.toISOString().replace(/[-:.]/gu, '').replace('Z', 'Z');
  const trials = [];
  for (const task of tasks)
    for (let trialIndex = 1; trialIndex <= options.trials; trialIndex += 1)
      trials.push(
        await runContextTrial({
          task,
          trialIndex,
          api,
          model: options.model,
          reasoningEffort: options.reasoningEffort,
          contextWindowTokens: contextProfile.contextWindowTokens,
          plannedInputTokens: tokenizer.count(task.scenario.map((step) => step.content).join('\n')),
          keepSession: options.keepSessions,
          ...(!options.skipJudge && dependencies.judge ? { judge: dependencies.judge } : {}),
        }),
      );
  const completedAt = new Date();
  const passStats = summarizePasses(trials);
  const report: ContextExperimentReport = {
    experimentId,
    benchmarkVersion: 'context-core-v1',
    benchmarkHash,
    graderVersion: 'context-graders-v1',
    fixtureHash,
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    systemPromptHash,
    toolSchemaHash,
    judgeProfile: {
      enabled: !options.skipJudge,
      promptVersion: 'context-judge-v1',
      ...(dependencies.judge?.profile ?? {}),
    },
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    seed: options.seed,
    trialsPerTask: options.trials,
    modelContextProfile: contextProfile,
    trials,
    summary: {
      tasks: tasks.length,
      trials: trials.length,
      passed: trials.filter((trial) => trial.passed).length,
      passRate: trials.filter((trial) => trial.passed).length / Math.max(trials.length, 1),
      ...passStats,
      criticalViolations: trials.reduce((total, trial) => total + trial.criticalViolations, 0),
      bootstrap95: bootstrapTaskPassRate(
        trials.map((trial) => ({ taskId: trial.taskId, passed: trial.passed })),
        options.seed,
      ),
      groups: groupTrials(trials),
      metrics: aggregateMetrics(trials),
    },
  };
  const manifest = {
    experimentId,
    gitCommit: gitCommit(workspace),
    benchmarkVersion: report.benchmarkVersion,
    benchmarkHash,
    graderVersion: report.graderVersion,
    fixtureHash,
    model: options.model,
    provider: 'deepseek',
    reasoningEffort: options.reasoningEffort,
    modelContextProfile: contextProfile,
    systemPromptHash,
    toolSchemaHash,
    evaluationClock: '2026-08-15T00:00:00.000Z',
    seed: options.seed,
    trialsPerTask: options.trials,
    command: options.command,
    judge: options.skipJudge ? { disabled: true } : { promptVersion: 'context-judge-v1' },
    runIds: trials.flatMap((trial) => trial.runs.map((run) => run.runId)),
  };
  await writeContextReport(options.outputDirectory, report, manifest, options.comparePath);
  return report;
}

function groupTrials(
  trials: ContextExperimentReport['trials'],
): ContextExperimentReport['summary']['groups'] {
  const dimensions = [
    ['capability', (trial: ContextExperimentReport['trials'][number]) => trial.capability],
    ['pressure', (trial: ContextExperimentReport['trials'][number]) => trial.pressure],
    ['suite', (trial: ContextExperimentReport['trials'][number]) => trial.suite],
  ] as const;
  return dimensions.flatMap(([dimension, select]) => {
    const keys = [...new Set(trials.map(select))].sort();
    return keys.map((key) => {
      const selected = trials.filter((trial) => select(trial) === key);
      const passed = selected.filter((trial) => trial.passed).length;
      return {
        dimension,
        key,
        trials: selected.length,
        passed,
        passRate: passed / Math.max(selected.length, 1),
      };
    });
  });
}

function aggregateMetrics(
  trials: ContextExperimentReport['trials'],
): ContextExperimentReport['summary']['metrics'] {
  const nullableTotal = (field: 'promptTokens' | 'completionTokens' | 'cachedTokens') =>
    trials.some((trial) => trial.metrics[field] === null)
      ? null
      : trials.reduce((total, trial) => total + (trial.metrics[field] ?? 0), 0);
  const ttft = trials.flatMap((trial) =>
    trial.metrics.ttftMs === null ? [] : [trial.metrics.ttftMs],
  );
  return {
    promptTokens: nullableTotal('promptTokens'),
    completionTokens: nullableTotal('completionTokens'),
    cachedTokens: nullableTotal('cachedTokens'),
    estimatedPromptTokens: trials.reduce(
      (total, trial) => total + trial.metrics.estimatedPromptTokens,
      0,
    ),
    peakPromptTokens: trials.some((trial) => trial.metrics.peakPromptTokens !== null)
      ? Math.max(
          ...trials.flatMap((trial) =>
            trial.metrics.peakPromptTokens === null ? [] : [trial.metrics.peakPromptTokens],
          ),
        )
      : null,
    peakEstimatedPromptTokens: Math.max(
      0,
      ...trials.map((trial) => trial.metrics.peakEstimatedPromptTokens),
    ),
    maxPressureRatio: Math.max(0, ...trials.map((trial) => trial.metrics.pressureRatio)),
    maxPlannedPressureRatio: Math.max(
      0,
      ...trials.map((trial) => trial.metrics.plannedPressureRatio),
    ),
    modelRounds: trials.reduce((total, trial) => total + trial.metrics.modelRounds, 0),
    toolCalls: trials.reduce((total, trial) => total + trial.metrics.toolCalls, 0),
    duplicateToolCalls: trials.reduce(
      (total, trial) => total + trial.metrics.duplicateToolCalls,
      0,
    ),
    averageTtftMs: ttft.length
      ? ttft.reduce((total, value) => total + value, 0) / ttft.length
      : null,
    durationMs: trials.reduce((total, trial) => total + trial.durationMs, 0),
    judgePromptTokens: trials.reduce(
      (total, trial) => total + (trial.judge?.usage?.promptTokens ?? 0),
      0,
    ),
    judgeCompletionTokens: trials.reduce(
      (total, trial) => total + (trial.judge?.usage?.completionTokens ?? 0),
      0,
    ),
    judgeErrors: trials.filter((trial) => trial.judgeError).length,
  };
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

async function hashFixtureDirectory(root: string): Promise<string> {
  const entries: string[] = [];
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath, relativePath);
      else if (entry.isFile()) {
        const digest = createHash('sha256')
          .update(await readFile(absolutePath))
          .digest('hex');
        entries.push(`${relativePath}\0${digest}`);
      } else throw new Error(`Unsupported fixture entry: ${relativePath}`);
    }
  };
  await visit(root, '');
  return sha256(entries.sort().join('\n'));
}

function gitCommit(workspace: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
