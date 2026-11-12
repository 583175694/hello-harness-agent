import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lintPresentationHtml } from '../preflight/lint-html.js';
import type { BuildDeckResult, ExportReport } from '../types.js';
import {
  runUnpackCheckStrict,
  unpackToExportChecks,
  unpackValidationPassed,
} from '../verify/unpack-report.js';

export type ExportHtmlFileOptions = {
  html: Buffer;
  fileName: string;
  outDir: string;
  unpackScriptPath: string;
  exportPptx: (htmlPath: string) => Promise<Buffer>;
};

/**
 * 把已交付的演示 HTML 转成 PPTX。
 *
 * 与 buildDeck 的区别是不重新渲染 deck plan：内容与样式完全沿用用户确认过的
 * HTML。这样既避免大 deck plan 在模型输出预算内被截断，也不会产生“再生成一次
 * 后选版式变了”的漂移。仍复用同一份 unpack 校验，PPTF 不达标就降级 HTML。
 */
export async function exportHtmlFileToPptx(
  options: ExportHtmlFileOptions,
): Promise<BuildDeckResult> {
  await mkdir(options.outDir, { recursive: true });
  const htmlPath = join(options.outDir, 'deck.html');
  const pptxPath = join(options.outDir, 'deck.pptx');
  const reportPath = join(options.outDir, 'export-report.json');
  // 复用旧 HTML 时也要满足跨环境字体门禁：浏览器与 PowerPoint 默认并不保证
  // PingFang/系统字体可用，统一换成项目已验证的 CJK 字体栈，只改字体声明，
  // 不动版式与内容。
  // 先把旧稿的字体栈归一化成镜像可解析的字族，再做静态契约检查：模型手写的
  // 稿子常见 PingFang SC / -apple-system，归一化后它们不再构成导出风险，若在
  // 归一化前 lint 会把本来能成功导出的稿子误杀。
  const normalizedHtml = normalizeFontStack(options.html.toString('utf8'));
  await writeFile(htmlPath, normalizedHtml, 'utf8');

  const html = normalizedHtml;
  const report: ExportReport = {
    planVersion: 1,
    env: { fonts: [] },
    checks: [],
    degrade: 'none',
  };

  // 生成侧门禁：模型直接写的 HTML 没有 deck plan 可比对，先把契约里可静态
  // 判定的部分挡在导出前，避免白等一轮浏览器导出才发现版式不可收敛。
  const lint = lintPresentationHtml(html);
  report.checks.push(...lint.checks);
  if (!lint.passed) {
    report.degrade = 'html_only';
    report.failureCode = 'html_contract_violation';
    report.failureReason = lint.issues.join('; ') || 'HTML does not satisfy the presentation contract';
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return { ok: false, paths: { htmlPath, reportPath }, html, report };
  }

  const startedAt = Date.now();
  let exportError: string | undefined;
  try {
    const buffer = await options.exportPptx(htmlPath);
    if (buffer.length === 0) throw new Error('导出的 PPTX 为空。');
    await writeFile(pptxPath, buffer);
  } catch (error) {
    exportError = error instanceof Error ? error.message : String(error);
  }
  report.checks.push({
    code: 'export',
    level: 'error',
    passed: !exportError,
    detail: exportError,
    value: Date.now() - startedAt,
  });
  report.metrics = { exportMs: Date.now() - startedAt };
  if (exportError) {
    report.degrade = 'html_only';
    report.failureCode = 'export_failed';
    report.failureReason = exportError;
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return { ok: false, paths: { htmlPath, reportPath }, html, report };
  }

  const slideCount = lint.slideCount;
  let unpack;
  try {
    unpack = await runUnpackCheckStrict({
      pptxPath,
      htmlPath,
      unpackScriptPath: options.unpackScriptPath,
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

  const checks = unpackToExportChecks(unpack, slideCount);
  report.checks.push(...checks);
  report.metrics = {
    ...report.metrics,
    slides: unpack.slides,
    tables: unpack.tables,
    runs: unpack.runs,
    cjkCoverage: unpack.cjkCoverage,
  };
  const passed = unpackValidationPassed(unpack, slideCount);
  report.degrade = passed ? 'none' : 'html_only';
  if (!passed) {
    report.failureCode = 'validation_failed';
    report.failureReason =
      checks
        .filter((check) => !check.passed)
        .map((check) => `${check.code}${check.detail ? `: ${check.detail}` : ''}`)
        .join('; ') || 'unpack check failed';
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return {
    ok: passed,
    paths: { htmlPath, pptxPath, reportPath },
    html,
    report,
    pptxBuffer: await readPptxBuffer(pptxPath),
  };
}

function normalizeFontStack(html: string): string {
  return html.replace(
    /font-family\s*:\s*[^;{}]+(?:;|\s*(?=\}))/giu,
    'font-family: "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;',
  );
}

async function readPptxBuffer(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}
