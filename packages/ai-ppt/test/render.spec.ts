import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderDeckToHtml, countTablesInPlan } from '../src/render/render-deck.js';
import { deckPlanSchema, FONT_FAMILY, FONT_FAMILY_BLACKLIST } from '../src/types.js';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/sample-10-cn/deck-plan.json',
);

describe('renderDeckToHtml', () => {
  const plan = deckPlanSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));

  it('renders one section per slide with the expected layouts', () => {
    const html = renderDeckToHtml(plan);
    expect(html.match(/<section class="slide"/g)?.length).toBe(plan.slides.length);
    expect(html.match(/<table class="data-table"/g)?.length).toBe(countTablesInPlan(plan));
    expect(html).toContain('data-layout="cover"');
    expect(html).toContain('data-layout="table"');
    expect(html).toContain('data-layout="conclusion"');
    expect(html).toContain('智慧税务');
  });

  it('stays inside the portable font contract', () => {
    const html = renderDeckToHtml(plan);
    expect(html).toContain(`font-family: ${FONT_FAMILY}`);
    for (const banned of FONT_FAMILY_BLACKLIST) {
      expect(html.includes(banned)).toBe(false);
    }
  });

  it('uses a fixed 1280x720 canvas with no vertical gaps', () => {
    const html = renderDeckToHtml(plan);
    expect(html).toMatch(/\.slide\s*\{[^}]*width:\s*1280px/);
    expect(html).toMatch(/\.slide\s*\{[^}]*height:\s*720px/);
    expect(html).toMatch(/\.slide\s*\{[^}]*overflow:\s*hidden/);
    // Layout stretching keeps three-column pages from leaving the lower half blank.
    expect(html).toMatch(/\.slide-body\s*\{[^}]*flex:\s*1 1 auto/);
  });

  it('escapes user content instead of injecting HTML', () => {
    const html = renderDeckToHtml({
      ...plan,
      slides: plan.slides.map((slide, index) =>
        index === 0
          ? { ...slide, content: { ...slide.content, title: '<script>alert(1)</script>' } }
          : slide,
      ),
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders schema-valid layouts when optional content is omitted', () => {
    const minimal = deckPlanSchema.parse({
      version: 1,
      meta: {
        title: '最小 deck',
        audience: '',
        language: 'zh-CN',
        aspectRatio: '16:9',
        styleId: 'default',
      },
      slides: [
        { id: 'cover', kind: 'cover', claim: '封面', layoutId: 'cover', content: { title: '封面' } },
        {
          id: 'three-col',
          kind: 'content',
          claim: '三栏',
          layoutId: 'three-col',
          content: { columns: ['一', '二', '三'] },
        },
        {
          id: 'conclusion',
          kind: 'closing',
          claim: '结论',
          layoutId: 'conclusion',
          content: { points: ['结论一'] },
        },
      ],
    });
    expect(() => renderDeckToHtml(minimal)).not.toThrow();
  });
});
