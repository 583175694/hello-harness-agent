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

  it('renders 10 slides with correct layouts and font contract', () => {
    const html = renderDeckToHtml(plan);
    expect(html.match(/<section class="slide"/g)?.length).toBe(10);
    expect(html).toContain(`font-family: ${FONT_FAMILY}`);
    for (const banned of FONT_FAMILY_BLACKLIST) {
      expect(html.includes(banned)).toBe(false);
    }
    expect(html.match(/<table class="data-table"/g)?.length).toBe(countTablesInPlan(plan));
    expect(html).toContain('data-layout="cover"');
    expect(html).toContain('data-layout="table"');
    expect(html).toContain('data-layout="conclusion"');
    expect(html).toMatch(/\.slide\s*\{[^}]*width:\s*1280px/);
    expect(html).toMatch(/height:\s*720px/);
    expect(html).toContain('智慧税务');
  });
});
