import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWorkspaceEnvironmentPath } from '../cli.js';
import { createContextJudgeFromEnvironment } from './judge.js';
import { runContextEvaluation, type ContextRunnerOptions } from './runner.js';
import type { ContextCapability, ContextPressure } from './types.js';

type CliOptions = Omit<ContextRunnerOptions, 'outputDirectory' | 'command'> & { output?: string };

export function parseContextCliArguments(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'smoke',
    apiBaseUrl: 'http://127.0.0.1:4318',
    trials: 1,
    seed: 20260815,
    keepSessions: false,
    skipJudge: false,
    model: 'deepseek-v4-flash',
    reasoningEffort: 'high',
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--keep-sessions') options.keepSessions = true;
    else if (argument === '--skip-judge') options.skipJudge = true;
    else if (argument === '--mode' && ['smoke', 'full', 'baseline'].includes(value ?? '')) {
      options.mode = value as CliOptions['mode'];
      options.trials = options.mode === 'smoke' ? 1 : options.mode === 'full' ? 3 : 5;
      index += 1;
    } else if (
      argument === '--trials' &&
      value &&
      Number.isInteger(Number(value)) &&
      Number(value) > 0
    ) {
      options.trials = Number(value);
      index += 1;
    } else if (argument === '--seed' && value && Number.isInteger(Number(value))) {
      options.seed = Number(value);
      index += 1;
    } else if (argument === '--case' && value) {
      options.caseId = value;
      index += 1;
    } else if (argument === '--capability' && value) {
      options.capability = value as ContextCapability;
      index += 1;
    } else if (argument === '--pressure' && ['S', 'M', 'L', 'X'].includes(value ?? '')) {
      options.pressure = value as ContextPressure;
      index += 1;
    } else if (argument === '--model' && value) {
      options.model = value;
      index += 1;
    } else if (
      argument === '--reasoning-effort' &&
      ['off', 'low', 'high', 'max'].includes(value ?? '')
    ) {
      options.reasoningEffort = value as CliOptions['reasoningEffort'];
      index += 1;
    } else if (argument === '--api-base-url' && value) {
      options.apiBaseUrl = value.replace(/\/$/u, '');
      index += 1;
    } else if (argument === '--compare' && value) {
      options.comparePath = resolve(value);
      index += 1;
    } else if (argument === '--output' && value) {
      options.output = resolve(value);
      index += 1;
    } else throw new Error(`未知或缺少值的参数：${argument ?? ''}`);
  }
  return options;
}

export async function main(): Promise<void> {
  try {
    process.loadEnvFile(resolveWorkspaceEnvironmentPath());
  } catch {
    /* shell env is valid */
  }
  const cli = parseContextCliArguments(process.argv.slice(2));
  const workspace = dirname(resolveWorkspaceEnvironmentPath());
  const outputDirectory =
    cli.output ?? join(workspace, '.eval/context', new Date().toISOString().replace(/[:.]/gu, '-'));
  const judge = cli.skipJudge ? undefined : createContextJudgeFromEnvironment();
  const report = await runContextEvaluation(
    { ...cli, outputDirectory, command: process.argv },
    { ...(judge ? { judge } : {}) },
  );
  console.log(
    `Context Eval 完成 | pass=${report.summary.passed}/${report.summary.trials} | critical=${report.summary.criticalViolations} | output=${outputDirectory}`,
  );
  if (report.summary.criticalViolations > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  void main().catch((error: unknown) => {
    console.error(`Context Eval 启动失败：${error instanceof Error ? error.message : '未知错误'}`);
    process.exitCode = 1;
  });
