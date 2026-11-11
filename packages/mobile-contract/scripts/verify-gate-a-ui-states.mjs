#!/usr/bin/env node
/**
 * Gate A §4.3 必覆盖 UI 状态 — fixture / 字段静态映射（非手验）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPreviewFixtureFieldChecks } from './preview-fixture-field-checks.mjs';

const contractRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewDir = path.join(contractRoot, 'fixtures/preview');
const repoRoot = path.resolve(contractRoot, '../..');

let failed = false;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function load(name) {
  const p = path.join(previewDir, name);
  if (!fs.existsSync(p)) {
    fail(`missing fixture ${name}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function read(rel) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) {
    fail(`missing ${rel}`);
    return '';
  }
  return fs.readFileSync(p, 'utf8');
}

function conversationHasMarkdownAssistant(data) {
  const conv = data?.conversation ?? [];
  return conv.some((row) => {
    if (row.kind !== 'assistant') return false;
    const blocks = row.blocks ?? [];
    return blocks.some((b) => `${b.content ?? ''}`.includes('#') || `${b.content ?? ''}`.includes('```'));
  });
}

runPreviewFixtureFieldChecks(load, { fail, ok });

if (conversationHasMarkdownAssistant(load('workbench-report-markdown.json'))) {
  ok('§4.3 Markdown assistant (workbench-report-markdown.json)');
} else {
  fail('workbench-report-markdown.json needs assistant Markdown blocks');
}

for (const [rel, themeRe, fontRe] of [
  [
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/settings/PreviewSettingsScreens.kt',
    /深色|PreviewThemeMode\.DARK/,
    /正文字号|contentFontSize/,
  ],
  [
    'apps/ios/Harness/Preview/PreviewSettingsViews.swift',
    /深色|themeMode == \.dark/,
    /正文字号|contentFontSize/,
  ],
  [
    'apps/harmony/entry/src/main/ets/pages/PreviewSettingsPage.ets',
    /深色主题|themeDark/,
    /正文字号|contentFontSize/,
  ],
]) {
  const text = read(rel);
  if (text && (!themeRe.test(text) || !fontRe.test(text))) {
    fail(`${rel} must expose Light/Dark theme + content font size (§4.3)`);
  }
}
ok('§4.3 Settings Light/Dark + 字号阶梯 (三端 Preview Settings)');

const androidThemeSnap =
  'apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAThemeSnapshotTest.kt';
if (!read(androidThemeSnap).includes('darkTheme')) {
  fail('GateAThemeSnapshotTest must cover darkTheme empty landing');
}
const iosThemeSnap = 'apps/ios/HarnessTests/GateAThemeSnapshotTests.swift';
if (!/testDarkThemeEmptyLandingFullShell|darkTheme/.test(read(iosThemeSnap))) {
  fail('GateAThemeSnapshotTests must cover dark theme empty landing');
}
ok('§4.3 dark theme snapshot (Android Paparazzi + iOS Snapshot)');

if (failed) {
  process.exit(1);
}
console.log('Gate A §4.3 UI state fixture matrix passed.');
