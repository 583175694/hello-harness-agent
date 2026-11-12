#!/usr/bin/env tsx
/**
 * End-to-end: 10-page deck-plan → HTML → PPTX → unpack strict check.
 *
 * Usage (repo root):
 *   pnpm exec tsx scripts/ai-ppt-e2e.mts
 *   pnpm exec tsx scripts/ai-ppt-e2e.mts --out qa
 */
import { readFile, mkdir, cp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildDeck } from '../packages/ai-ppt/src/pipeline/build-deck.js';
import { deckPlanSchema } from '../packages/ai-ppt/src/types.js';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const outArg = process.argv.indexOf('--out');
const outDir =
  outArg >= 0 ? resolve(process.cwd(), process.argv[outArg + 1] ?? 'qa') : join(root, 'qa', 'ai-ppt-e2e-run');

async function main(): Promise<number> {
  const fixture = join(root, 'packages/ai-ppt/fixtures/sample-10-cn/deck-plan.json');
  const unpackScript = join(root, 'scripts/ppt-unpack-check.py');
  const plan = deckPlanSchema.parse(JSON.parse(await readFile(fixture, 'utf8')));

  await mkdir(outDir, { recursive: true });
  const started = Date.now();
  const result = await buildDeck({
    plan,
    outDir,
    unpackScriptPath: unpackScript,
  });
  const elapsedMs = Date.now() - started;

  const report = result.report;
  report.metrics = { ...report.metrics, pipelineMs: elapsedMs };

  const qaDir = join(root, 'qa');
  await mkdir(qaDir, { recursive: true });
  const qaReport = join(qaDir, 'export-report.json');
  await cp(join(outDir, 'export-report.json'), qaReport);

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        outDir,
        degrade: report.degrade,
        failureCode: report.failureCode,
        metrics: report.metrics,
        elapsedMs,
      },
      null,
      2,
    ),
  );

  if (!result.ok) {
    console.error(report.failureReason ?? 'buildDeck failed');
    if (report.failureCode === 'env_font_missing') {
      console.error(
        'Install CJK fonts (e.g. apt install fonts-noto-cjk or brew install --cask font-noto-sans-cjk).',
      );
    }
    return 1;
  }

  const { stdout } = await execFileAsync(
    'python3',
    [unpackScript, join(outDir, 'deck.pptx'), '--html', join(outDir, 'deck.html'), '--strict'],
    { encoding: 'utf8' },
  );
  const unpack = JSON.parse(stdout) as { passed: boolean; cjkCoverage?: number; slides?: number };
  if (!unpack.passed || (unpack.cjkCoverage !== undefined && unpack.cjkCoverage < 1)) {
    console.error('unpack strict check failed:', stdout);
    return 1;
  }
  if (unpack.slides !== plan.slides.length) {
    console.error(`slide count mismatch: ${unpack.slides} != ${plan.slides.length}`);
    return 1;
  }

  console.log('ai-ppt-e2e: PASS');
  return 0;
}

process.exit(await main());
