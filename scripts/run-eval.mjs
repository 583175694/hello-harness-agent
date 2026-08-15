import { spawnSync } from 'node:child_process';

const HELP = `评测命令：
  pnpm eval -- research smoke [参数...]   # 运行 6 题真实联网快速评测
  pnpm eval -- research full [参数...]    # 运行 24 题真实联网完整评测
  pnpm eval -- context smoke [参数...]    # 运行 Context Smoke 子集，每题 1 个 Trial
  pnpm eval -- context full [参数...]     # 运行完整 20 题，每题默认 3 个 Trial
  pnpm eval -- context baseline [参数...] # 运行正式 Baseline，每题默认 5 个 Trial
  pnpm eval -- context calibrate --input <human-review.csv> # 校准 Judge，不调用 Agent

常用参数：
  --case <id>  --trials <n>  --skip-judge  --keep-sessions  --output <dir>
  Context 还支持：--capability <name>  --pressure <S|M|L|X>  --compare <summary.json>

Research 需要普通 API 和联网 Provider；Context 需要先运行 pnpm dev:eval。
Judge 从根目录 .env 读取 EVAL_JUDGE_*；不需要 Judge 时传 --skip-judge。`;

// pnpm 的不同调用形式可能保留参数分隔符；脚本入口统一剥离一个前导 `--`。
const inputArguments = process.argv.slice(2);
if (inputArguments[0] === '--') inputArguments.shift();
const [target, requestedMode, ...forwarded] = inputArguments;
if (!target || ['help', '--help', '-h'].includes(target)) {
  console.log(HELP);
  process.exit(0);
}

// 所有评测都经过共享协议和评测包的构建；Context 额外构建本地 Tokenizer。
const configurations = {
  research: {
    modes: ['smoke', 'full'],
    builds: ['@harness/agent-protocol', '@harness/agent-evals'],
    command: (mode) => ['--filter', '@harness/agent-evals', 'start', '--suite', mode],
  },
  context: {
    modes: ['smoke', 'full', 'baseline'],
    builds: ['@harness/agent-protocol', '@harness/deepseek-tokenizer', '@harness/agent-evals'],
    command: (mode) => ['--filter', '@harness/agent-evals', 'context:start', '--mode', mode],
  },
};

if (target === 'context' && requestedMode === 'calibrate') {
  runPnpm(['--filter', '@harness/agent-evals', 'build']);
  runPnpm(['--filter', '@harness/agent-evals', 'context:calibrate', ...forwarded]);
  process.exit(0);
}

const configuration = configurations[target];
// 省略 mode 且直接传 flag 时默认 smoke，并把该 flag 原样交给底层评测 CLI。
const mode = !requestedMode || requestedMode.startsWith('-') ? 'smoke' : requestedMode;
const evaluationArguments = requestedMode?.startsWith('-')
  ? [requestedMode, ...forwarded]
  : forwarded;
if (!configuration || !configuration.modes.includes(mode)) {
  console.error(`未知评测组合：${[target, requestedMode].filter(Boolean).join(' ')}\n\n${HELP}`);
  process.exit(1);
}

for (const packageName of configuration.builds) runPnpm(['--filter', packageName, 'build']);
runPnpm([...configuration.command(mode), ...evaluationArguments]);

// 禁用 shell 拼接，参数逐项传给 pnpm，保留退出码和终端交互行为。
function runPnpm(args) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`无法执行 pnpm：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
