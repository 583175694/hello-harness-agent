import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportHtmlToPptx } from 'dom-to-pptx/node';
import { launchChromium, puppeteerExecutablePath } from '../preflight/browser.js';
import { materializeCompositeBorders } from './composite-borders.js';
import { postprocessPptxBuffer } from './postprocess-pptx.js';
import { materializePseudoCounters } from './pseudo-counters.js';
import { applySingleLineFixes } from './text-fit-fixes.js';

export type ExportPptxOptions = {
  htmlPath: string;
  timeoutMs?: number;
};

/**
 * Point Puppeteer at the image/system Chrome when one is resolvable.
 *
 * Only when we have no usable executable do we need a writable download
 * cache: Puppeteer tries to fetch ~200 MB of Headless Chrome, and the API
 * unit runs with `ProtectHome=read-only`, so the default
 * `~/.cache/puppeteer` would fail with an opaque mkdir error. That fallback
 * is best-effort — a read-only working directory must not break an export
 * that could otherwise run with the browser we already have.
 */
async function configurePuppeteerBrowser(): Promise<void> {
  const puppeteerPath = puppeteerExecutablePath();
  if (puppeteerPath) {
    process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerPath;
    return;
  }
  if (process.env.PUPPETEER_CACHE_DIR?.trim()) return;
  const cacheDir = join(process.cwd(), '.cache', 'puppeteer');
  try {
    await mkdir(cacheDir, { recursive: true });
    process.env.PUPPETEER_CACHE_DIR = cacheDir;
  } catch {
    // Let Puppeteer surface its own actionable installation error.
  }
}

export async function exportDeckToPptxBuffer(htmlPath: string): Promise<Buffer> {
  await configurePuppeteerBrowser();

  // 针对 dom-to-pptx 转换器已知缺陷的导出前 DOM 预处理，复用同一浏览器实例：
  //   1. CSS 计数器伪元素会被写成字面量 “counter(p)”，并与 <ol> 编号重复；
  //   2. 纯文本容器上的单侧边框 SVG zIndex 低于实心背景而被遮盖；
  //   3. 单行小标签按 rect 估宽偏小在 PPTX 折行，flex 右侧文字缺右对齐。
  const html = await readFile(htmlPath, 'utf8');
  const needsCounters = /\bcounter[s]?\(/iu.test(html);
  const browser = await launchChromium();
  try {
    if (needsCounters) {
      await materializePseudoCounters(htmlPath, { browser });
    }
    await materializeCompositeBorders(htmlPath, { browser });
    await applySingleLineFixes(htmlPath, { browser });
  } finally {
    await browser.close();
  }

  const rawBuffer = await exportHtmlToPptx(htmlPath, {
    selector: '.slide',
    injectBundle: true,
    browserWidth: 1280,
    browserHeight: 720,
    pptxOptions: {
      width: 13.333,
      height: 7.5,
      includePseudoElements: true,
    },
  });

  return postprocessPptxBuffer(rawBuffer);
}
