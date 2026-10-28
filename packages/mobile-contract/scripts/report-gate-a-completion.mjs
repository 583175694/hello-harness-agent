#!/usr/bin/env node
/**
 * Gate A 关 Goal 前总览：自动化 + human-evidence（不替代 completion-audit 人工读表）。
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

console.log('== validate:gate-a ==');
execSync('pnpm validate:gate-a', { cwd: repoRoot, stdio: 'inherit' });

console.log('\n== human evidence ==');
execSync('pnpm gate-a:human-evidence', { cwd: repoRoot, stdio: 'inherit' });

console.log('\n== completion-audit 仍含 ❌ 的行（需消除后才能关 Goal）==');
const audit = execSync('grep "❌" docs/native-mobile-gate-a-completion-audit.md || true', {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (audit.trim()) console.log(audit.trim());
else console.log('（无 ❌ 行 — 仍须 human-evidence 全绿 + Git 入库）');

console.log('\n入口：docs/native-mobile-gate-a-signoff-checklist.md');
