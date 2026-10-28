#!/usr/bin/env node
/** 从最近一次 Macrobenchmark JSON 打印 runbook 摘要（Gate A §8.2）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const androidRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(
  androidRoot,
  'macrobenchmark/build/outputs/connected_android_test_additional_output/previewBenchmark/connected',
);

if (!fs.existsSync(outRoot)) {
  console.error('No benchmark output; run pnpm gate-a:benchmark:android first.');
  process.exit(1);
}

const deviceDir = fs.readdirSync(outRoot).find((d) => fs.statSync(path.join(outRoot, d)).isDirectory());
if (!deviceDir) process.exit(1);

const jsonPath = path.join(outRoot, deviceDir, 'com.harness.agent.macrobenchmark-benchmarkData.json');
if (!fs.existsSync(jsonPath)) {
  console.error('Missing benchmarkData.json at', jsonPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const bench = data.benchmarks?.[0];
const frameDur = bench?.sampledMetrics?.frameDurationCpuMs;
if (!frameDur?.P50 || !frameDur?.runs) {
  console.error('Unexpected benchmark JSON shape');
  process.exit(1);
}

const frames = frameDur.runs.flat();
const budgetMs = 16.67;
const severe = frames.filter((d) => d > 2 * budgetMs).length;
const medianFps = (1000 / frameDur.P50).toFixed(1);
const severePct = ((100 * severe) / frames.length).toFixed(1);

console.log('== Gate A Android Macrobenchmark summary ==');
console.log(`device dir: ${deviceDir}`);
console.log(`median FPS (from P50 frameDuration): ${medianFps}`);
console.log(`severe frames (>2×16.7ms): ${severePct}% (${severe}/${frames.length})`);
console.log(`P50 frameDurationCpuMs: ${frameDur.P50.toFixed(2)}`);
console.log('Copy into apps/android/docs/gate-a-runbook.md if re-run.');
