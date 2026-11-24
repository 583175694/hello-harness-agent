import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { materializeCompositeBorders } from '../src/export/composite-borders.js';
import { applySingleLineFixes } from '../src/export/text-fit-fixes.js';
import { chromiumExecutablePath } from '../src/preflight/browser.js';

const hasBrowser = Boolean(chromiumExecutablePath());

describe.skipIf(!hasBrowser)('DOM export preprocessors', () => {
  async function writeTempHtml(html: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'ai-ppt-dom-pre-'));
    const path = join(dir, 'deck.html');
    await writeFile(path, html, 'utf8');
    return path;
  }

  it('materializes border-left on a filled callout into an absolute bar without touching tables', async () => {
    const htmlPath = await writeTempHtml(`<!doctype html>
<html><head><style>
  .slide { width: 1280px; height: 720px; overflow: hidden; }
  .callout { background: #fdf6ec; border-left: 4px solid #c99a3e; padding: 14px 18px; font-size: 14px; }
  table td { background: #f8f9fa; border-bottom: 1px solid #ddd; padding: 8px; }
</style></head>
<body><section class="slide">
  <div class="callout"><strong>老师的定性：</strong>今天是不及格的。</div>
  <table><tr><td>单元格</td></tr></table>
</section></body></html>`);

    const result = await materializeCompositeBorders(htmlPath);

    expect(result.materialized).toBe(1);
    expect(result.html).toContain('data-ppt-border-bar="left"');
    expect(result.html).toContain('data-ppt-border-content');
    expect(result.html).toContain('padding-left: 22px');
  });

  it('applies nowrap to bordered transparent badges, long single-line footers/bullets, and right-aligns flex trailing labels', async () => {
    const htmlPath = await writeTempHtml(`<!doctype html>
<html><head><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .slide { width: 1280px; height: 720px; overflow: hidden; padding: 48px; }
  .badge { display: inline-block; border: 1px solid #666; padding: 8px 16px; font-size: 13px; }
  .row { display: flex; justify-content: space-between; width: 1184px; }
  .right-label { font-size: 13px; color: #888; }
  .footer { font-size: 12px; color: #888; margin-top: 12px; }
  .para { width: 220px; font-size: 14px; line-height: 1.6; }
</style></head>
<body><section class="slide">
  <div class="badge">12 页 · 指数 / 板块 / 个股</div>
  <div class="row">
    <span class="left-label">01 指数：涨了 0.27%，为什么体感这么差</span>
    <span class="right-label">为什么走势这么差</span>
  </div>
  <div class="footer">来源：上海证券报、证券时报、财联社、第一财经、每日经济新闻、Wind 整理，数据截至收盘。</div>
  <p class="para">美国国会与英伟达董事会的调查仍在继续，回归之后只管研发与技术。</p>
</section></body></html>`);

    const result = await applySingleLineFixes(htmlPath);

    expect(result.adjusted).toBeGreaterThanOrEqual(3);
    expect(result.html).toMatch(/class="badge"[^>]*white-space:\s*nowrap/u);
    expect(result.html).toMatch(/class="right-label"[^>]*white-space:\s*nowrap/u);
    expect(result.html).toMatch(/class="right-label"[^>]*text-align:\s*right/u);
    expect(result.html).toMatch(/class="footer"[^>]*white-space:\s*nowrap/u);
    expect(result.html).not.toMatch(/class="para"[^>]*white-space:\s*nowrap/u);
  });
});
