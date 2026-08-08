import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// 读取本地 .env 中用于初始化 PostgreSQL 的配置。
function loadLocalEnv() {
  if (!existsSync('.env')) return {};
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

// 配置优先级为当前进程环境变量、项目 .env、本地开发默认值。
const localEnv = loadLocalEnv();

const host = process.env.POSTGRES_HOST ?? localEnv.POSTGRES_HOST ?? '127.0.0.1';
const port = process.env.POSTGRES_PORT ?? localEnv.POSTGRES_PORT ?? '5432';
const user = process.env.POSTGRES_USER ?? localEnv.POSTGRES_USER ?? 'harness';
const password = process.env.POSTGRES_PASSWORD ?? localEnv.POSTGRES_PASSWORD ?? 'harness_local';
const database = process.env.POSTGRES_DB ?? localEnv.POSTGRES_DB ?? 'harness';

// 将字符串安全转换为 PostgreSQL 字符串字面量。
function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

// 校验并引用 PostgreSQL 标识符。
function sqlIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`非法 PostgreSQL 标识符：${value}`);
  }
  return `"${value}"`;
}

// 角色初始化 SQL 可重复执行，不覆盖已存在角色的其他属性。
const sql = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${sqlLiteral(user)}) THEN
    ALTER ROLE ${sqlIdentifier(user)} WITH LOGIN PASSWORD ${sqlLiteral(password)};
  ELSE
    CREATE ROLE ${sqlIdentifier(user)} LOGIN PASSWORD ${sqlLiteral(password)};
  END IF;
END
$$;
`;

// 执行本地命令并把输出交给当前终端。
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    console.error(`无法执行 ${command}：${result.error.message}`);
    process.exit(1);
  }
  return result.status ?? 1;
}

const roleResult = run('psql', [
  '-h',
  host,
  '-p',
  port,
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
  '-c',
  sql,
]);

if (roleResult !== 0) {
  process.exit(roleResult);
}

const databaseExists = spawnSync(
  'psql',
  [
    '-h',
    host,
    '-p',
    port,
    '-d',
    'postgres',
    '-Atc',
    `SELECT 1 FROM pg_database WHERE datname = ${sqlLiteral(database)}`,
  ],
  { encoding: 'utf8' },
);

if (databaseExists.status !== 0) {
  console.error(databaseExists.stderr || '无法检查 PostgreSQL 数据库。');
  process.exit(databaseExists.status ?? 1);
}

if (!databaseExists.stdout.trim()) {
  const databaseResult = run('createdb', ['-h', host, '-p', port, '-O', user, database]);
  if (databaseResult !== 0) process.exit(databaseResult);
}

console.log(`本地 PostgreSQL 已准备：${host}:${port}/${database}（用户 ${user}）`);
