import { describe, expect, it } from 'vitest';
import { renderDeckToHtml } from '../src/render/render-deck.js';
import { deckPlanSchema, FONT_FAMILY, FONT_FAMILY_BLACKLIST } from '../src/types.js';
import type { UnpackReport } from '../src/verify/unpack-report.js';
import { unpackToExportChecks, unpackValidationPassed } from '../src/verify/unpack-report.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/sample-10-cn/deck-plan.json',
);

function report(overrides: Partial<UnpackReport> = {}): UnpackReport {
  return {
    slides: 10,
    tables: 2,
    runs: 118,
    cjkCoverage: 1,
    blacklistedTypefaces: [],
    typefaces: { 'Noto Sans CJK SC': 474 },
    passed: true,
    failedChecks: [],
    raw: {},
    ...overrides,
  };
}

describe('typeface contract', () => {
  it('renders a stack that resolves on Debian images and macOS', () => {
    const plan = deckPlanSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
    const html = renderDeckToHtml(plan);

    expect(FONT_FAMILY).toContain('Noto Sans CJK SC');
    expect(FONT_FAMILY).toContain('Noto Sans SC');
    expect(html).toContain(`font-family: ${FONT_FAMILY}`);
    for (const banned of FONT_FAMILY_BLACKLIST) {
      expect(html.includes(banned)).toBe(false);
    }
  });
});

describe('unpackToExportChecks', () => {
  it('passes a deck with full CJK coverage and a real typeface', () => {
    expect(unpackValidationPassed(report(), 10)).toBe(true);
    expect(unpackToExportChecks(report(), 10).every((c) => c.passed)).toBe(true);
  });

  it('fails when the PPTX carries a blacklisted typeface', () => {
    const checks = unpackToExportChecks(
      report({ blacklistedTypefaces: ['-apple-system'], typefaces: { '-apple-system': 474 } }),
      10,
    );
    expect(checks.find((c) => c.code === 'typeface_blacklist')?.passed).toBe(false);
    expect(unpackValidationPassed(report({ blacklistedTypefaces: ['-apple-system'] }), 10)).toBe(false);
  });

  it('fails when no typeface was written at all', () => {
    expect(unpackValidationPassed(report({ typefaces: {} }), 10)).toBe(false);
  });

  it('fails when slides are missing or CJK text was dropped', () => {
    expect(unpackValidationPassed(report({ slides: 9 }), 10)).toBe(false);
    expect(unpackValidationPassed(report({ cjkCoverage: 0 }), 10)).toBe(false);
  });
});
