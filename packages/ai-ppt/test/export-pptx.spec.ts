import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exportHtmlToPptx = vi.fn().mockResolvedValue(Buffer.from('pptx'));
const materializePseudoCounters = vi.fn().mockResolvedValue({ html: '', replacements: 1 });
const applySingleLineFixes = vi.fn().mockResolvedValue({ html: '', adjusted: 0 });
const puppeteerExecutablePath = vi.fn<() => string | undefined>(() => undefined);

vi.mock('dom-to-pptx/node', () => ({ exportHtmlToPptx }));
vi.mock('../src/export/pseudo-counters.js', () => ({ materializePseudoCounters }));
vi.mock('../src/export/text-fit-fixes.js', () => ({ applySingleLineFixes }));
vi.mock('../src/preflight/browser.js', () => ({ puppeteerExecutablePath }));

const { exportDeckToPptxBuffer } = await import('../src/export/export-pptx.js');

const ORIGINAL_PUPPETEER_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
const ORIGINAL_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR;

async function htmlFile(html: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ai-ppt-export-'));
  const path = join(dir, 'deck.html');
  await writeFile(path, html, 'utf8');
  return path;
}

describe('exportDeckToPptxBuffer', () => {
  beforeEach(() => {
    exportHtmlToPptx.mockClear();
    materializePseudoCounters.mockClear();
    applySingleLineFixes.mockClear();
    puppeteerExecutablePath.mockReset();
    puppeteerExecutablePath.mockReturnValue(undefined);
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    delete process.env.PUPPETEER_CACHE_DIR;
  });

  afterEach(() => {
    if (ORIGINAL_PUPPETEER_PATH === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
    else process.env.PUPPETEER_EXECUTABLE_PATH = ORIGINAL_PUPPETEER_PATH;
    if (ORIGINAL_CACHE_DIR === undefined) delete process.env.PUPPETEER_CACHE_DIR;
    else process.env.PUPPETEER_CACHE_DIR = ORIGINAL_CACHE_DIR;
  });

  it('materializes CSS pseudo-element counters before exporting', async () => {
    const path = await htmlFile(
      '<html><style>ol li::before{content:counter(p)}</style>' +
        '<div class="slide"><ol><li>一</li></ol></div></html>',
    );

    await exportDeckToPptxBuffer(path);

    expect(materializePseudoCounters).toHaveBeenCalledWith(path);
    expect(applySingleLineFixes).toHaveBeenCalledWith(path);
    expect(exportHtmlToPptx).toHaveBeenCalledWith(
      path,
      expect.objectContaining({ selector: '.slide', injectBundle: true }),
    );
  });

  it('skips the counter pass when the HTML does not use CSS counters', async () => {
    const path = await htmlFile('<html><div class="slide"><h1>标题</h1></div></html>');

    await exportDeckToPptxBuffer(path);

    expect(materializePseudoCounters).not.toHaveBeenCalled();
    // 单行标签修正只读 DOM、不碰正文，仍然需要跑一次。
    expect(applySingleLineFixes).toHaveBeenCalledTimes(1);
    expect(exportHtmlToPptx).toHaveBeenCalledTimes(1);
  });

  it('uses a discovered system browser without preparing a download cache', async () => {
    puppeteerExecutablePath.mockReturnValue('/usr/bin/google-chrome-stable');

    const path = await htmlFile('<html><div class="slide"><h1>标题</h1></div></html>');
    await exportDeckToPptxBuffer(path);

    expect(process.env.PUPPETEER_EXECUTABLE_PATH).toBe('/usr/bin/google-chrome-stable');
    expect(process.env.PUPPETEER_CACHE_DIR).toBeUndefined();
  });

  it('only falls back to a writable cache when no browser can be resolved', async () => {
    const path = await htmlFile('<html><div class="slide"><h1>标题</h1></div></html>');
    await exportDeckToPptxBuffer(path);

    expect(process.env.PUPPETEER_CACHE_DIR).toBe(join(process.cwd(), '.cache', 'puppeteer'));
  });
});
