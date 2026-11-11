#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'fixtures/markdown-golden/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

let failed = 0;

for (const scenario of manifest.scenarios) {
  const previewPath = join(root, scenario.previewFixture.replace(/^fixtures\//, 'fixtures/'));
  const payloadPath = join(root, scenario.payloadFile.replace(/^fixtures\//, 'fixtures/'));
  if (!existsSync(previewPath)) {
    console.error(`MISS preview: ${scenario.previewFixture}`);
    failed += 1;
    continue;
  }
  if (!existsSync(payloadPath)) {
    console.error(`MISS payload: ${scenario.payloadFile}`);
    failed += 1;
    continue;
  }
  const preview = JSON.parse(readFileSync(previewPath, 'utf8'));
  const payload = readFileSync(payloadPath, 'utf8');
  const assistant = preview.conversation?.find((t) => t.kind === 'assistant');
  const blockText = assistant?.blocks?.find((b) => b.type === 'text')?.content ?? '';
  if (blockText !== payload) {
    console.error(`${scenario.id}: payload.md 与 preview fixture assistant 正文不一致`);
    failed += 1;
    continue;
  }
  console.log(`OK  ${scenario.id}`);
}

if (failed) {
  console.error(`\nmarkdown-golden: ${failed} scenario(s) failed`);
  process.exit(1);
}
console.log(`\nmarkdown-golden: ${manifest.scenarios.length} scenarios verified`);
