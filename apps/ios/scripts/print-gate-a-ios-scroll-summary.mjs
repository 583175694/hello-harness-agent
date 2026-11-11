#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const iosRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath =
  process.argv[2] ||
  path.join(iosRoot, 'build/gate-a-scroll-perf.json');

if (!fs.existsSync(jsonPath)) {
  console.error('Missing', jsonPath, '— run bash scripts/run-gate-a-long-thread-scroll.sh');
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
console.log('== Gate A iOS scroll perf summary ==');
console.log(`median FPS: ${Number(j.medianFps).toFixed(1)}`);
console.log(`severe frames (>2×16.7ms): ${Number(j.severeFramePct).toFixed(1)}%`);
console.log(`P50 frame ms: ${Number(j.p50FrameDurationMs).toFixed(2)}`);
console.log('Copy into apps/ios/docs/gate-a-runbook.md if re-run.');
