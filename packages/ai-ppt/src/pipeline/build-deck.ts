import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { exportDeckToPptxBuffer } from '../export/export-pptx.js';
import { runF0EnvProbe } from '../preflight/f0-env.js';
import { runF1OverflowChecks } from '../preflight/f1-overflow.js';
import { runF1StaticChecks } from '../preflight/f1-static.js';
import { renderDeckToHtml } from '../render/render-deck.js';
import type { BuildDeckResult, DeckPlan, ExportReport } from '../types.js';
import { runUnpackCheckStrict, unpackToExportChecks } from '../verify/unpack-report.js';

export type BuildDeckOptions = {
  plan: DeckPlan;
  outDir: string;
  unpackScriptPath: string;
  skipExport?: boolean;
};

function emptyReport(plan: DeckPlan): ExportReport {
  return {
    planVersion: plan.version,
    env: { fonts: [] },
    checks: [],
    degrade: 'none',
  };
}

async function attemptExport(
  htmlPath: string,
  pptxPath: string,
): Promise<{ ok: boolean; error?: string; ms: number }> {
  const started = Date.now();
  try {
    const buffer = await exportDeckToPptxBuffer(htmlPath);
    await writeFile(pptxPath, buffer);
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildDeck(options: BuildDeckOptions): Promise<BuildDeckResult> {
  const { plan, outDir, unpackScriptPath } = options;
  await mkdir(outDir, { recursive: true });

  const htmlPath = join(outDir, 'deck.html');
  const pptxPath = join(outDir, 'deck.pptx');
  const reportPath = join(outDir, 'export-report.json');

  const html = renderDeckToHtml(plan);
  await writeFile(htmlPath, html, 'utf8');

  const report = emptyReport(plan);
  const browser = await chromium.launch({ headless: true });

  try {
    const f0 = await runF0EnvProbe({ browser });
    report.env.fonts = f0.fonts;
    report.checks.push({
      code: 'f0_font_probe',
      level: 'error',
      passed: f0.passed,
      detail: f0.message,
      value: f0.nonBlankRatio,
      threshold: 0.005,
    });
    if (!f0.passed) {
      report.degrade = 'html_only';
      report.failureCode = f0.code ?? 'env_font_missing';
      report.failureReason = f0.message ?? 'font probe failed';
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      return {
        ok: false,
        paths: { htmlPath, reportPath },
        html,
        report,
      };
    }

    const f1Static = runF1StaticChecks(html, plan);
    report.checks.push(...f1Static.checks);

    const f1Overflow = await runF1OverflowChecks(html, { browser });
    report.checks.push(...f1Overflow.checks);
    report.metrics = {
      overflowContainers: f1Overflow.overflowContainers,
    };

    const preflightOk = f1Static.passed && f1Overflow.passed;
    if (!preflightOk) {
      report.degrade = 'html_only';
      report.failureCode = 'preflight_failed';
      report.failureReason = [...f1Static.issues, ...f1Overflow.details].join('; ');
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      return {
        ok: false,
        paths: { htmlPath, reportPath },
        html,
        report,
      };
    }

    if (options.skipExport) {
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      return {
        ok: true,
        paths: { htmlPath, reportPath },
        html,
        report,
      };
    }

    let exportTry = await attemptExport(htmlPath, pptxPath);
    if (!exportTry.ok) {
      exportTry = await attemptExport(htmlPath, pptxPath);
    }

    report.checks.push({
      code: 'export',
      level: 'error',
      passed: exportTry.ok,
      detail: exportTry.error,
      value: exportTry.ms,
    });
    report.metrics = { ...report.metrics, exportMs: exportTry.ms };

    if (!exportTry.ok) {
      report.degrade = 'html_only';
      report.failureCode = 'export_failed';
      report.failureReason = exportTry.error;
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      return {
        ok: false,
        paths: { htmlPath, reportPath },
        html,
        report,
      };
    }

    let unpack = await runUnpackCheckStrict({
      pptxPath,
      htmlPath,
      unpackScriptPath,
      jsonOutPath: reportPath,
    });
    let unpackChecks = unpackToExportChecks(unpack, plan.slides.length);
    report.checks.push(...unpackChecks);
    report.metrics = {
      ...report.metrics,
      slides: unpack.slides,
      tables: unpack.tables,
      runs: unpack.runs,
      cjkCoverage: unpack.cjkCoverage,
    };

    const validationOk = unpack.passed && unpackChecks.every((c) => c.passed);
    if (!validationOk) {
      const retryExport = await attemptExport(htmlPath, pptxPath);
      if (retryExport.ok) {
        unpack = await runUnpackCheckStrict({
          pptxPath,
          htmlPath,
          unpackScriptPath,
          jsonOutPath: reportPath,
        });
        unpackChecks = unpackToExportChecks(unpack, plan.slides.length);
        report.checks = report.checks.filter(
          (c) => !['unpack_slides', 'cjk_coverage', 'unpack_passed'].includes(c.code),
        );
        report.checks.push(...unpackChecks);
        report.metrics = {
          ...report.metrics,
          slides: unpack.slides,
          tables: unpack.tables,
          runs: unpack.runs,
          cjkCoverage: unpack.cjkCoverage,
        };
      }
    }

    const finalOk =
      unpack.passed &&
      unpackToExportChecks(unpack, plan.slides.length).every((c) => c.passed);

    if (!finalOk) {
      report.degrade = 'html_only';
      report.failureCode = 'validation_failed';
      report.failureReason = unpack.failedChecks.join('; ') || 'unpack check failed';
      report.checks.push({
        code: 'validation',
        level: 'error',
        passed: false,
        detail: report.failureReason,
      });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      return {
        ok: false,
        paths: { htmlPath, pptxPath, reportPath },
        html,
        report,
        pptxBuffer: await readFile(pptxPath),
      };
    }

    report.degrade = 'none';
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const pptxBuffer = await readFile(pptxPath);
    return {
      ok: true,
      paths: { htmlPath, pptxPath, reportPath },
      html,
      report,
      pptxBuffer,
    };
  } finally {
    await browser.close();
  }
}
