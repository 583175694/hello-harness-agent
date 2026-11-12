import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { exportHtmlFileToPptx } from '../src/pipeline/export-html-file.js';

describe('exportHtmlFileToPptx', () => {
  it('normalizes an existing HTML font stack before exporting', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'ai-ppt-html-'));
    const html = Buffer.from(
      '<html><style>' +
        '.slide{width:1280px;height:720px;overflow:hidden;font-family:"PingFang SC",sans-serif}' +
        '</style><div class="slide"><h1>标题</h1></div></html>',
    );
    const exportPptx = vi.fn().mockResolvedValue(Buffer.from('pptx'));

    await exportHtmlFileToPptx({
      html,
      fileName: 'deck.html',
      outDir,
      unpackScriptPath: '/does-not-exist/unpack.py',
      exportPptx,
    });

    expect(exportPptx).toHaveBeenCalledWith(join(outDir, 'deck.html'));
    const written = await import('node:fs/promises').then((fs) =>
      fs.readFile(join(outDir, 'deck.html'), 'utf8'),
    );
    expect(written).toContain('Noto Sans CJK SC');
    expect(written).not.toContain('PingFang SC');
  });
});

describe('exportHtmlFileToPptx contract gate', () => {
  it('normalizes fonts before linting so legacy PingFang decks still export', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'ai-ppt-html-'));
    const html = Buffer.from(
      '<html><style>' +
        '.slide{width:1280px;height:720px;overflow:hidden;' +
        'font-family:"PingFang SC",sans-serif}</style>' +
        '<section class="slide"><h1>标题</h1></section></html>',
    );
    const exportPptx = vi.fn().mockResolvedValue(Buffer.from('pptx'));

    await exportHtmlFileToPptx({
      html,
      fileName: 'deck.html',
      outDir,
      unpackScriptPath: '/does-not-exist/unpack.py',
      exportPptx,
    });

    expect(exportPptx).toHaveBeenCalled();
  });

  it('rejects a non-conforming HTML before starting the browser exporter', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'ai-ppt-html-'));
    const html = Buffer.from(
      '<html><style>.slide{width:100%;font-family:"Noto Sans SC",sans-serif}</style>' +
        '<section class="slide"><h1>标题</h1></section></html>',
    );
    const exportPptx = vi.fn().mockResolvedValue(Buffer.from('pptx'));

    const result = await exportHtmlFileToPptx({
      html,
      fileName: 'deck.html',
      outDir,
      unpackScriptPath: '/does-not-exist/unpack.py',
      exportPptx,
    });

    expect(exportPptx).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.report.failureCode).toBe('html_contract_violation');
    expect(result.report.failureReason).toContain('1280x720');
  });

  it('counts only real slide roots when validating page count', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'ai-ppt-html-'));
    const html = Buffer.from(
      '<html><style>' +
        '.slide{width:1280px;height:720px;overflow:hidden}' +
        '</style><section class="slide"><header class="slide-header">t</header>' +
        '<div class="slide-body">b</div></section>' +
        '<section class="slide"><div class="slide-body">b</div></section></html>',
    );
    const exportPptx = vi.fn().mockResolvedValue(Buffer.from('pptx'));
    const result = await exportHtmlFileToPptx({
      html,
      fileName: 'deck.html',
      outDir,
      unpackScriptPath: '/does-not-exist/unpack.py',
      exportPptx,
    });
    expect(result.report.failureCode).not.toBe('html_contract_violation');
  });
});
