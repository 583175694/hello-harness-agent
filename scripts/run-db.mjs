import { spawnSync } from 'node:child_process';

const HELP = `数据库命令：
  pnpm db -- setup                 初始化本地 PostgreSQL、部署 migration、生成 Client
  pnpm db -- init                  只初始化本地 PostgreSQL 用户和数据库
  pnpm db -- update                部署已有 migration 并生成 Client
  pnpm db -- generate [参数...]    只生成 Prisma Client
  pnpm db -- migrate [参数...]     创建开发 migration
  pnpm db -- deploy [参数...]      部署已有 migration
  pnpm db -- studio [参数...]      打开 Prisma Studio`;

// pnpm 的不同调用形式可能保留参数分隔符；脚本入口统一剥离一个前导 `--`。
const inputArguments = process.argv.slice(2);
if (inputArguments[0] === '--') inputArguments.shift();
const [action, ...forwarded] = inputArguments;
if (!action || ['help', '--help', '-h'].includes(action)) {
  console.log(HELP);
  process.exit(0);
}

// setup/update 是稳定的组合命令；底层动作仍可单独调用用于开发和排障。
if (action === 'setup') {
  runNode(['scripts/setup-local-postgres.mjs']);
  runApi('db:deploy');
  runApi('db:generate');
} else if (action === 'init') {
  runNode(['scripts/setup-local-postgres.mjs', ...forwarded]);
} else if (action === 'update') {
  runApi('db:deploy');
  runApi('db:generate');
} else if (['generate', 'migrate', 'deploy', 'studio'].includes(action)) {
  runApi(`db:${action}`, forwarded);
} else {
  console.error(`未知数据库动作：${action}\n\n${HELP}`);
  process.exit(1);
}

function runApi(script, args = []) {
  run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
    '--filter',
    '@harness/api',
    script,
    ...args,
  ]);
}

function runNode(args) {
  run(process.execPath, args);
}

// 禁用 shell 拼接，参数逐项传递，并在任一步失败时立即保留原退出码。
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`无法执行 ${command}：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
