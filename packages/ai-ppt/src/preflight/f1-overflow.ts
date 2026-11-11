import { chromium, type Browser } from 'playwright';
import type { ExportReportCheck } from '../types.js';

const OVERFLOW_SELECTORS = [
  '.slide',
  '.slide-body',
  '.slide-header',
  '.three-col',
  '.col-card',
  '.col-body',
  '.table-wrap',
  '.data-table',
  '.agenda-list',
  '.conclusion-points',
  '.actions-list',
];

export type F1OverflowResult = {
  passed: boolean;
  overflowContainers: number;
  checks: ExportReportCheck[];
  details: string[];
};

export async function runF1OverflowChecks(
  html: string,
  options?: { browser?: Browser },
): Promise<F1OverflowResult> {
  const ownBrowser = !options?.browser;
  const browser =
    options?.browser ??
    (await chromium.launch({
      headless: true,
    }));

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    const overflows = await page.evaluate((selectors) => {
      const hits: string[] = [];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          const node = el as HTMLElement;
          const sh = node.scrollHeight;
          const ch = node.clientHeight;
          const sw = node.scrollWidth;
          const cw = node.clientWidth;
          if (sh > ch + 2 || sw > cw + 2) {
            hits.push(
              `${selector} scroll ${sh}x${sw} > client ${ch}x${cw}`,
            );
          }
        }
      }
      const slides = document.querySelectorAll('.slide');
      for (const slide of slides) {
        const rect = slide.getBoundingClientRect();
        for (const child of slide.querySelectorAll('*')) {
          const childRect = child.getBoundingClientRect();
          if (
            childRect.bottom > rect.bottom + 2 ||
            childRect.right > rect.right + 2 ||
            childRect.top < rect.top - 2 ||
            childRect.left < rect.left - 2
          ) {
            hits.push(
              `bbox overflow inside slide: ${child.tagName}.${(child.className || '').toString().slice(0, 40)}`,
            );
          }
        }
      }
      return hits;
    }, OVERFLOW_SELECTORS);

    await page.close();

    const overflowContainers = overflows.length;
    const passed = overflowContainers === 0;
    const checks: ExportReportCheck[] = [
      {
        code: 'overflow',
        level: 'error',
        passed,
        value: overflowContainers,
        threshold: 0,
      },
    ];

    return {
      passed,
      overflowContainers,
      checks,
      details: overflows,
    };
  } finally {
    if (ownBrowser) await browser.close();
  }
}
