import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function loadEnv() {
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

const args = new Set(process.argv.slice(2));
const confirmArg = process.argv.slice(2).find((value) => value.startsWith('--confirm='));
const execute = args.has('--execute');
const env = loadEnv();
const rawUrl = process.env.DATABASE_URL ?? env.DATABASE_URL;
if (!rawUrl) throw new Error('缺少 DATABASE_URL。');
const url = new URL(rawUrl);
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!localHosts.has(url.hostname)) {
  throw new Error(`拒绝清理非本机数据库：${url.hostname}`);
}
const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!database) throw new Error('DATABASE_URL 中缺少数据库名。');
const schema = url.searchParams.get('schema') ?? 'public';
if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema)) throw new Error('非法 schema 名称。');
url.searchParams.delete('schema');
const psqlUrl = url.toString();

function psql(sql) {
  const result = spawnSync('psql', [psqlUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'psql 执行失败。');
  return result.stdout.trim();
}

const table = (name) => `"${schema}"."${name}"`;
const hasTranscript =
  psql(`SELECT to_regclass('${schema.replaceAll("'", "''")}.model_transcript_items') IS NOT NULL;`) ===
  't';
const countsSql = [
  `SELECT 'sessions=' || count(*) FROM ${table('sessions')}`,
  `SELECT 'messages=' || count(*) FROM ${table('messages')}`,
  `SELECT 'agent_runs=' || count(*) FROM ${table('agent_runs')}`,
  `SELECT 'agent_run_steps=' || count(*) FROM ${table('agent_run_steps')}`,
  ...(hasTranscript
    ? [`SELECT 'model_transcript_items=' || count(*) FROM ${table('model_transcript_items')}`]
    : []),
  `SELECT 'users=' || count(*) FROM ${table('users')}`,
].join(' UNION ALL ');

console.log(`目标：${url.hostname}:${url.port || '5432'}/${database}?schema=${schema}`);
console.log(psql(countsSql));
if (!execute) {
  console.log(`Dry-run 完成。执行删除：pnpm db:reset-reasoning-cutover -- --execute --confirm=${database}`);
  process.exit(0);
}
if (confirmArg !== `--confirm=${database}`) {
  throw new Error(`确认不匹配。必须显式传入 --confirm=${database}`);
}

const deleted = psql(`BEGIN; DELETE FROM ${table('sessions')}; COMMIT;`);
console.log(deleted || '已删除全部 Session 及其级联数据。');
console.log('删除后：');
console.log(psql(countsSql));
