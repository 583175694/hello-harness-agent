import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportHtmlToPptx } from 'dom-to-pptx/node';
import { puppeteerExecutablePath } from '../preflight/browser.js';
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

  // 两个已知的转换器缺陷，都只在真的命中时才启动额外浏览器：
  //   1. CSS 计数器伪元素会被写成字面量 “counter(p)”，并与 <ol> 编号重复；
  //   2. 带底色的小标签按 rect 估宽偏小，在 PPTX 里折成两行。
  const html = await readFile(htmlPath, 'utf8');
  if (/\bcounter[s]?\(/iu.test(html)) {
    await materializePseudoCounters(htmlPath);
  }
  await applySingleLineFixes(htmlPath);

  const buffer = await exportHtmlToPptx(htmlPath, {
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
  return buffer;
}
