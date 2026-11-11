#!/usr/bin/env node
/**
 * Gate A：鸿蒙 rawfile preview fixture 存在性 + 与 contract 同字段校验。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPreviewFixtureFieldChecks } from '../../../packages/mobile-contract/scripts/preview-fixture-field-checks.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const previewDir = path.resolve(
  scriptDir,
  '../entry/src/main/resources/rawfile/mobile-contract/fixtures/preview',
);

if (!fs.existsSync(previewDir)) {
  console.error(`FAIL: missing ${previewDir} — run sync-mobile-contract.sh first`);
  process.exit(1);
}

const REQUIRED = [
  'empty-landing.json',
  'streaming-assistant-tail.json',
  'long-thread-scroll.json',
  'process-timeline-tools.json',
  'hitl-clarification.json',
  'hitl-tool-approval.json',
  'workbench-activity-bash.json',
  'workbench-report-markdown.json',
  'workbench-sources.json',
  'connection-offline-error.json',
  'workbench-sources-retrieval-only.json',
];

const names = new Set(fs.readdirSync(previewDir).filter((f) => f.endsWith('.json')));
for (const name of REQUIRED) {
  if (!names.has(name)) {
    console.error(`FAIL: rawfile missing ${name}`);
    process.exit(1);
  }
}

let failed = false;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`OK: Harmony rawfile ${msg}`);
}

function loadJson(name) {
  const p = path.join(previewDir, name);
  if (!fs.existsSync(p)) {
    fail(`missing ${name}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`${name} invalid JSON: ${e.message}`);
    return null;
  }
}

runPreviewFixtureFieldChecks(loadJson, { fail, ok });

if (failed) {
  process.exit(1);
}

console.log(`OK: Harmony rawfile preview fixtures (${names.size} json, field checks passed)`);
