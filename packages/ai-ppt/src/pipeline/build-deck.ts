import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchChromium } from '../preflight/browser.js';
import { runF0EnvProbe } from '../preflight/f0-env.js';
import { runF1OverflowChecks } from '../preflight/f1-overflow.js';
import { runF1StaticChecks } from '../preflight/f1-static.js';
import { renderDeckToHtml } from '../render/render-deck.js';
import type { BuildDeckResult, DeckPlan, ExportReport } from '../types.js';
import {
  UNPACK_CHECK_CODES,
  runUnpackCheckStrict,
  unpackToExportChecks,
  unpackValidationPassed,
} from '../verify/unpack-report.js';

export type BuildDeckOptions = {
  plan: DeckPlan;
  outDir: string;
  unpackScriptPath: string;
};

export type BuildDeckDependencies = {
  /** 导出器允许注入，API 侧用纯 Node 实现避免把 ESM 包静态引入 CommonJS 构建。 */
  exportPptx?: (htmlPath: string) => Promise<Buffer>;
};

// 延迟加载导出链：dom-to-pptx 是纯 ESM，API 的 Jest/CommonJS 单测不应在
// 只要渲染 HTML 时就被迫初始化 Puppeteer。
async function defaultExportPptx(htmlPath: string): Promise<Buffer> {
  const { exportDeckToPptxBuffer } = await import('../export/export-pptx.js');
  return exportDeckToPptxBuffer(htmlPath);
}

function emptyReport(plan: DeckPlan): ExportReport {
  return {
    planVersion: plan.version,
    env: { fonts: [] },
    checks: [],
    degrade: 'none',
  };
}

async function attemptExport(
  exportPptx: (htmlPath: string) => Promise<Buffer>,
  htmlPath: string,
  pptxPath: string,
): Promise<{ ok: boolean; error?: string; ms: number }> {
  const started = Date.now();
  try {
    const buffer = await exportPptx(htmlPath);
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

async function readPptxBuffer(pptxPath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(pptxPath);
  } catch {
    return undefined;
  }
}

export async function buildDeck(
  options: BuildDeckOptions,
  dependencies: BuildDeckDependencies = {},
): Promise<BuildDeckResult> {
  const { plan, outDir, unpackScriptPath } = options;
  await mkdir(outDir, { recursive: true });

  const htmlPath = join(outDir, 'deck.html');
  const pptxPath = join(outDir, 'deck.pptx');
  const reportPath = join(outDir, 'export-report.json');

  const html = renderDeckToHtml(plan);
  await writeFile(htmlPath, html, 'utf8');

  const report = emptyReport(plan);
  const exportPptx = dependencies.exportPptx ?? defaultExportPptx;
  let browser;
  try {
    browser = await launchChromium();
  } catch (error) {
    report.degrade = 'html_only';
    report.failureCode = 'preflight_failed';
    report.failureReason = `Chromium 启动失败：${error instanceof Error ? error.message : String(error)}`;
    report.checks.push({
      code: 'chromium_launch',
      level: 'error',
      passed: false,
      detail: report.failureReason,
    });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return { ok: false, paths: { htmlPath, reportPath }, html, report };
  }

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

    let exportTry = await attemptExport(exportPptx, htmlPath, pptxPath);
    if (!exportTry.ok) {
      exportTry = await attemptExport(exportPptx, htmlPath, pptxPath);
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

    let unpack;
    try {
      unpack = await runUnpackCheckStrict({
        pptxPath,
        htmlPath,
        unpackScriptPath,
        jsonOutPath: reportPath,
      });
    } catch (error) {
      // 校验器本身不可用（例如部署环境缺 Python 脚本）时，PPTX 已经导出成功，
      // 不应把整个工具判为失败；降级交付 HTML 并保留具体原因。
      report.degrade = 'html_only';
      report.failureCode = 'validation_failed';
      report.failureReason = `unpack check failed: ${error instanceof Error ? error.message : String(error)}`;
      report.checks.push({
        code: 'unpack_passed',
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
        pptxBuffer: await readPptxBuffer(pptxPath),
      };
    }
    let unpackChecks = unpackToExportChecks(unpack, plan.slides.length);
    report.checks.push(...unpackChecks);
    report.metrics = {
      ...report.metrics,
      slides: unpack.slides,
      tables: unpack.tables,
      runs: unpack.runs,
      cjkCoverage: unpack.cjkCoverage,
    };

    const validationOk = unpackValidationPassed(unpack, plan.slides.length);
    if (!validationOk) {
      const retryExport = await attemptExport(exportPptx, htmlPath, pptxPath);
      if (retryExport.ok) {
        try {
          unpack = await runUnpackCheckStrict({
            pptxPath,
            htmlPath,
            unpackScriptPath,
            jsonOutPath: reportPath,
          });
        } catch (error) {
          report.degrade = 'html_only';
          report.failureCode = 'validation_failed';
          report.failureReason = `unpack check failed: ${error instanceof Error ? error.message : String(error)}`;
          report.checks.push({
            code: 'unpack_passed',
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
            pptxBuffer: await readPptxBuffer(pptxPath),
          };
        }
        unpackChecks = unpackToExportChecks(unpack, plan.slides.length);
        report.checks = report.checks.filter(
          (c) => !(UNPACK_CHECK_CODES as readonly string[]).includes(c.code),
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

    const finalOk = unpackValidationPassed(unpack, plan.slides.length);

    if (!finalOk) {
      report.degrade = 'html_only';
      report.failureCode = 'validation_failed';
      const failing = unpackChecks.filter((c) => !c.passed).map((c) => `${c.code}${c.detail ? `: ${c.detail}` : ''}`);
      report.failureReason = failing.join('; ') || unpack.failedChecks.join('; ') || 'unpack check failed';
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
        pptxBuffer: await readPptxBuffer(pptxPath),
      };
    }

    report.degrade = 'none';
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return {
      ok: true,
      paths: { htmlPath, pptxPath, reportPath },
      html,
      report,
      pptxBuffer: await readPptxBuffer(pptxPath),
    };
  } finally {
    await browser.close();
  }
}
