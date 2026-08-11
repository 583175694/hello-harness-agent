import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveJudgeProfile, SemanticJudge } from './judge.js';
import { selectCases } from './cases.js';
import { assertLocalResearchConfiguration } from './preflight.js';
import { runEvaluation } from './runner.js';

type CliOptions = {
  suite: 'smoke' | 'full';
  caseId?: string;
  keepSessions: boolean;
  skipJudge: boolean;
  apiBaseUrl: string;
  output?: string;
};

// 读取仓库根目录 .env，同时允许调用方环境变量覆盖文件值。
function loadEnvironment(): void {
  try {
    process.loadEnvFile(resolveWorkspaceEnvironmentPath());
  } catch {
    /* 环境变量可由 shell 直接提供。 */
  }
}

// 根据 CLI 模块位置稳定定位 workspace 根目录，不依赖 pnpm filter 的当前目录。
export function resolveWorkspaceEnvironmentPath(moduleUrl: string = import.meta.url): string {
  return fileURLToPath(new URL('../../../.env', moduleUrl));
}

// 根据根 .env 路径得到评测默认输出目录，避免 pnpm filter 改变输出位置。
function resolveDefaultOutputDirectory(): string {
  const workspaceRoot = dirname(resolveWorkspaceEnvironmentPath());
  return join(workspaceRoot, '.eval', 'research', new Date().toISOString().replace(/[:.]/gu, '-'));
}

// 解析无额外依赖的评测 CLI 参数，并拒绝未知选项。
export function parseCliArguments(args: string[]): CliOptions {
  const options: CliOptions = {
    suite: 'smoke',
    keepSessions: false,
    skipJudge: false,
    apiBaseUrl: 'http://127.0.0.1:4318',
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--keep-sessions') options.keepSessions = true;
    else if (argument === '--skip-judge') options.skipJudge = true;
    else if (argument === '--suite' && (value === 'smoke' || value === 'full')) {
      options.suite = value;
      index += 1;
    } else if (argument === '--case' && value) {
      options.caseId = value;
      index += 1;
    } else if (argument === '--api-base-url' && value) {
      options.apiBaseUrl = value.replace(/\/$/u, '');
      index += 1;
    } else if (argument === '--output' && value) {
      options.output = value;
      index += 1;
    } else throw new Error(`未知或缺少值的参数：${argument ?? ''}`);
  }
  return options;
}

// 执行命令行评测并以硬规则结果决定进程退出码。
export async function main(): Promise<void> {
  loadEnvironment();
  const cli = parseCliArguments(process.argv.slice(2));
  assertLocalResearchConfiguration(cli.apiBaseUrl, selectCases(cli.suite, cli.caseId));
  const output = resolve(cli.output ?? resolveDefaultOutputDirectory());
  let judge: SemanticJudge | undefined;
  let judgeProfile;
  if (!cli.skipJudge) {
    judgeProfile = resolveJudgeProfile();
    judge = new SemanticJudge(judgeProfile);
  }
  console.log(`开始 General Web Research 评测 | suite=${cli.suite} | API=${cli.apiBaseUrl}`);
  const report = await runEvaluation(
    {
      suite: cli.suite,
      ...(cli.caseId ? { caseId: cli.caseId } : {}),
      keepSessions: cli.keepSessions,
      skipJudge: cli.skipJudge,
      apiBaseUrl: cli.apiBaseUrl,
      outputDirectory: output,
      command: process.argv,
    },
    { judge, judgeProfile },
  );
  console.log(
    `评测完成 | 通过=${report.summary.hardPassed}/${report.summary.total} | Judge=${report.summary.averageJudgeScore?.toFixed(2) ?? 'N/A'} | 输出=${output}`,
  );
  if (!report.hardPassed) process.exitCode = 1;
}

// 仅在 CLI 入口直接执行时启动，测试导入参数解析函数不会触发真实评测。
function isMainModule(): boolean {
  return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]!);
}

if (isMainModule()) {
  void main().catch((error: unknown) => {
    console.error(`评测启动失败：${error instanceof Error ? error.message : '未知错误'}`);
    process.exitCode = 1;
  });
}
