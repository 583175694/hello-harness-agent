import { describe, expect, it } from 'vitest';
import { lintPresentationHtml } from '../src/preflight/lint-html.js';
import { renderDeckToHtml } from '../src/render/render-deck.js';
import { deckPlanSchema } from '../src/types.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/sample-10-cn/deck-plan.json',
);

const PLAN = deckPlanSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));

function htmlWith(body: string, css = ''): string {
  return `<!doctype html><html><head><style>
    * { box-sizing: border-box; }
    .slide { width: 1280px; height: 720px; overflow: hidden; position: relative; }
    ${css}
  </style></head><body>${body}</body></html>`;
}

describe('lintPresentationHtml', () => {
  it('accepts renderer output including slide-header / slide-body children', () => {
    const html = renderDeckToHtml(PLAN);
    const result = lintPresentationHtml(html);
    expect(result.issues).toEqual([]);
    expect(result.passed).toBe(true);
    // Regression: a loose \\bslide\\b match counted slide-header/slide-body too.
    expect(result.slideCount).toBe(PLAN.slides.length);
  });

  it('rejects HTML without a slide root', () => {
    const result = lintPresentationHtml(htmlWith('<div>hi</div>'));
    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toContain('class="slide"');
  });

  it('accepts div.slide roots, matching the exporter selector', () => {
    const html = htmlWith('<div class="slide"><p>x</p></div>');
    expect(lintPresentationHtml(html).passed).toBe(true);
  });

  it('rejects a canvas that is not fixed 1280x720', () => {
    const html = `<!doctype html><html><head><style>.slide { width: 100%; }</style></head>
      <body><section class="slide"><p>x</p></section></body></html>`;
    const result = lintPresentationHtml(html);
    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toMatch(/1280x720/);
  });

  it('rejects blacklisted and viewport-dependent fonts/layout', () => {
    const html = htmlWith(
      '<section class="slide"><p>x</p></section>',
      'body { font-family: "PingFang SC", sans-serif; } .k { width: 100vw; }',
    );
    const result = lintPresentationHtml(html);
    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toContain('PingFang SC');
    expect(result.issues.join(' ')).toContain('vw/vh');
  });

  it('rejects CSS the exporter cannot reproduce', () => {
    const html = htmlWith(
      '<section class="slide"><p>x</p></section>',
      '.x { clip-path: circle(40%); } .y { position: fixed; }',
    );
    const result = lintPresentationHtml(html);
    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toContain('clip-path');
    expect(result.issues.join(' ')).toContain('position: fixed');
  });

  it('treats radial-gradient as a warning, not a failure', () => {
    const html = htmlWith(
      '<section class="slide"><p>x</p></section>',
      '.cover { background: radial-gradient(#fff, #eee); }',
    );
    const result = lintPresentationHtml(html);
    expect(result.passed).toBe(true);
    expect(result.checks.find((c) => c.code === 'html_gradient')).toMatchObject({
      level: 'warn',
      passed: false,
    });
  });

  it('rejects an agenda built from <ol>/<li> because the exporter flattens it', () => {
    const html = htmlWith(`<section class="slide">
      <ol class="agenda">
        <li><span class="agenda-num">01</span><span>核心结论</span></li>
        <li><span class="agenda-num">02</span><span>市场规模</span></li>
      </ol>
    </section>`);
    const result = lintPresentationHtml(html);
    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toContain('layout list (agenda)');
  });

  it('counts an item list whose <li> carries its own border as a layout list', () => {
    const html = htmlWith(`<section class="slide">
      <ul class="toc">
        <li style="border-bottom:1px solid #ddd">一</li>
        <li style="border-bottom:1px solid #ddd">二</li>
      </ul>
    </section>`);
    expect(lintPresentationHtml(html).passed).toBe(false);
  });

  it('rejects a list whose items use a bold number run', () => {
    const html = htmlWith(`<section class="slide">
      <ol class="toc">
        <li><b>01</b> 核心结论</li>
        <li><b>02</b> 市场规模</li>
      </ol>
    </section>`);
    expect(lintPresentationHtml(html).passed).toBe(false);
  });

  it('still accepts an ordinary bullet list', () => {
    const html = htmlWith(`<section class="slide">
      <ul class="actions-list">
        <li>先铺量</li>
        <li>再建资产</li>
      </ul>
    </section>`);
    expect(lintPresentationHtml(html).passed).toBe(true);
  });
});
