#!/usr/bin/env node
/**
 * Phase B Snapshot 对拍：一次打印 session + run REST 摘要（完成标准 2）。
 *
 * Usage:
 *   HARNESS_SESSION_COOKIE='harness_session=…' pnpm phase-b:parity <sessionId> [runId]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const sessionId = process.argv[2];
const runId = process.argv[3];
const cookie = process.env.HARNESS_SESSION_COOKIE;
const root = path.dirname(fileURLToPath(import.meta.url));

if (!sessionId) {
  console.error('Usage: HARNESS_SESSION_COOKIE=... pnpm phase-b:parity <sessionId> [runId]');
  process.exit(1);
}
if (!cookie) {
  console.error('Missing HARNESS_SESSION_COOKIE (login Web /agent or mobile Settings first).');
  process.exit(1);
}

const env = { ...process.env };

console.log('=== Session summary ===');
const sessionRun = spawnSync('node', [path.join(root, 'phase-b-session-summary.mjs'), sessionId], {
  env,
  encoding: 'utf8',
});
if (sessionRun.status !== 0) {
  process.stderr.write(sessionRun.stderr || sessionRun.stdout);
  process.exit(sessionRun.status ?? 1);
}
process.stdout.write(sessionRun.stdout);

const effectiveRunId =
  runId ||
  (() => {
    try {
      const parsed = JSON.parse(sessionRun.stdout);
      return parsed.activeRun?.runId ?? parsed.lastAssistantRunId ?? null;
    } catch {
      return null;
    }
  })();

if (!effectiveRunId) {
  console.log('\n(no runId — skip run summary; pass runId as 2nd arg or pick a session with activeRun)');
  process.exit(0);
}

console.log('\n=== Run summary ===');
const runProc = spawnSync('node', [path.join(root, 'phase-b-run-summary.mjs'), effectiveRunId], {
  env,
  encoding: 'utf8',
});
if (runProc.status !== 0) {
  process.stderr.write(runProc.stderr || runProc.stdout);
  process.exit(runProc.status ?? 1);
}
process.stdout.write(runProc.stdout);
