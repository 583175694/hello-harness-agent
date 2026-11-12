import { readFile } from 'node:fs/promises';
import { exportHtmlToPptx } from 'dom-to-pptx/node';
import { chromiumExecutablePath } from '../preflight/browser.js';
import { materializePseudoCounters } from './pseudo-counters.js';
import { applySingleLineFixes } from './text-fit-fixes.js';

export type ExportPptxOptions = {
  htmlPath: string;
  timeoutMs?: number;
};

export async function exportDeckToPptxBuffer(htmlPath: string): Promise<Buffer> {
  // dom-to-pptx calls puppeteer.executablePath(), which honours the resolved
  // Puppeteer configuration (including PUPPETEER_EXECUTABLE_PATH). Point it at
  // the image Chromium when configured, so preflight and export measure and
  // render with the exact same binary and fontconfig.
  const executablePath = chromiumExecutablePath();
  if (executablePath) process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;

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
