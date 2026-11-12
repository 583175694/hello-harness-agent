import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exportHtmlToPptx = vi.fn().mockResolvedValue(Buffer.from('pptx'));
const materializePseudoCounters = vi.fn().mockResolvedValue({ html: '', replacements: 1 });
const applySingleLineFixes = vi.fn().mockResolvedValue({ html: '', adjusted: 0 });

vi.mock('dom-to-pptx/node', () => ({ exportHtmlToPptx }));
vi.mock('../src/export/pseudo-counters.js', () => ({ materializePseudoCounters }));
vi.mock('../src/export/text-fit-fixes.js', () => ({ applySingleLineFixes }));

const { exportDeckToPptxBuffer } = await import('../src/export/export-pptx.js');

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
});
