#!/usr/bin/env node
/**
 * Gate A 人工证据进度（签字表、§8.2 runbook、入库提示）。不阻塞 validate:gate-a / CI。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function countUiRegressionSignoff(md) {
  let total = 0;
  let done = 0;
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|/);
    if (!m) continue;
    const cells = line.split('|').map((c) => c.trim());
    // | # | auto | Android | iOS | 鸿蒙 | date |
    const platforms = [cells[3], cells[4], cells[5]];
    for (const cell of platforms) {
      total += 1;
      if (/☑|✅|\[x\]/i.test(cell)) done += 1;
    }
  }
  return { total, done };
}

function countHarmonyScenarioSignoff(md) {
  let rows = 0;
  let cellsTotal = 0;
  let cellsDone = 0;
  for (const line of md.split('\n')) {
    if (!/^\|\s*`[^`]+\.json`/.test(line)) continue;
    rows += 1;
    const parts = line.split('|').slice(1, -1).map((c) => c.trim());
    for (const cell of parts) {
      if (cell.includes('☐') || cell.includes('☑') || cell.includes('✅')) {
        cellsTotal += 1;
        if (/☑|✅|\[x\]/i.test(cell)) cellsDone += 1;
      }
    }
  }
  return { rows, cellsTotal, cellsDone };
}

function runbookFilled(rel) {
  const md = read(rel);
  if (/_待填_|待填/.test(md)) return false;
  const tableLines = md.split('\n').filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}/.test(l));
  return tableLines.length > 0;
}

function gitGateAUntracked() {
  try {
    const out = execSync(
      'git status --porcelain -- apps/android apps/ios apps/harmony packages/mobile-contract',
      { cwd: repoRoot, encoding: 'utf8' },
    );
    return /^(\?\?|A )/m.test(out) || out.includes('??');
  } catch {
    return false;
  }
}

function adbReady() {
  try {
    const out = execSync('adb devices', { encoding: 'utf8' });
    return out.split('\n').some((l) => /\tdevice$/.test(l));
  } catch {
    return false;
  }
}

const uiPath = 'docs/native-mobile-gate-a-ui-regression-signoff.md';
const harmonyPath = 'apps/harmony/docs/gate-a-scenario-signoff.md';
const ui = countUiRegressionSignoff(read(uiPath));
const harmony = countHarmonyScenarioSignoff(read(harmonyPath));

console.log('== human evidence (Goal 关闭所需) ==');
console.log(
  `UI 回归签字: ${ui.done}/${ui.total} 格（19×3） — ${uiPath}`,
);
console.log(
  `鸿蒙十场景: ${harmony.cellsDone}/${harmony.cellsTotal} ☑ 格，${harmony.rows} fixture 行 — ${harmonyPath}`,
);

const androidRunbook = runbookFilled('apps/android/docs/gate-a-runbook.md');
const iosRunbook = runbookFilled('apps/ios/docs/gate-a-runbook.md');
console.log(
  `§8.2 Android runbook 帧率表: ${androidRunbook ? '已填 dated 行' : '未填（含 _待填_）'}`,
);
console.log(
  `§8.2 iOS runbook 帧率表: ${iosRunbook ? '已填 dated 行' : '未填（含 _待填_）'}`,
);

if (gitGateAUntracked()) {
  console.log('Git: Gate A 路径仍有未入库变更 — blockers #1');
} else {
  console.log('Git: apps/* + mobile-contract 无 ?? 未跟踪（或已 staged/committed）');
}

if (androidRunbook && iosRunbook) {
  console.log('§8.2: 双端 runbook 已填 — 复测 Android 需 adb：`pnpm gate-a:benchmark:android`');
} else {
  console.log(
    `adb: ${adbReady() ? '有 device，可跑 Macrobenchmark' : '无 device — Android §8.2 需模拟器/真机'}`,
  );
}

const goalReady =
  ui.done === ui.total &&
  harmony.cellsDone === harmony.cellsTotal &&
  androidRunbook &&
  iosRunbook &&
  !gitGateAUntracked();

if (goalReady) {
  console.log('OK: 人工证据表齐全 — 可跑 completion-audit 后关 Goal');
} else {
  console.log('PENDING: 见 docs/native-mobile-gate-a-blockers.md');
  if (ui.done < ui.total) {
    console.log(`  → UI 回归还差 ${ui.total - ui.done} 格：docs/native-mobile-gate-a-signoff-checklist.md`);
  }
  if (harmony.cellsDone < harmony.cellsTotal) {
    console.log(`  → 鸿蒙十场景还差 ${harmony.cellsTotal - harmony.cellsDone} ☑ 格`);
  }
  if (gitGateAUntracked()) {
    console.log('  → Git：pnpm gate-a:prep-commit 后 commit（或回复 Agent「按 prep-commit 范围提交」）');
  }
}
