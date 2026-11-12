import type { ExportReportCheck } from '../types.js';
import { FONT_FAMILY_BLACKLIST } from '../types.js';

/**
 * Static, generation-side contract checks for hand-authored presentation HTML.
 *
 * `runF1StaticChecks` validates HTML produced by the deck-plan renderer, where
 * the plan supplies the expected slide/table counts. An HTML file the model
 * wrote directly has no plan, so this lint only enforces the parts of
 * docs/48 §14 that can be decided from the source alone. Rendering-level
 * overflow is still covered by the exporter's unpack checks.
 */
export type HtmlLintResult = {
  passed: boolean;
  checks: ExportReportCheck[];
  issues: string[];
  slideCount: number;
};

const FORBIDDEN_CSS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /clip-path\s*:/iu, label: 'clip-path' },
  { pattern: /backdrop-filter\s*:/iu, label: 'backdrop-filter' },
  { pattern: /mix-blend-mode\s*:/iu, label: 'mix-blend-mode' },
  { pattern: /(?:^|[;{\s])filter\s*:/iu, label: 'filter' },
  { pattern: /(?:^|[;{\s])mask\s*:/iu, label: 'mask' },
  { pattern: /position\s*:\s*fixed/iu, label: 'position: fixed' },
];

// Match any element whose class list contains the standalone token `slide`.
// `\bslide\b` alone also matches `slide-header` / `slide-body`, which used to
// inflate the page count; the token check keeps `div.slide` working.
const ELEMENT_WITH_CLASS_RE = /<([a-z][\w-]*)\b[^>]*\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/giu;

export function lintPresentationHtml(html: string): HtmlLintResult {
  const checks: ExportReportCheck[] = [];
  const issues: string[] = [];
  const css = extractCss(html);

  const slideCount = countRootSlides(html);
  const slideOk = slideCount > 0;
  checks.push({
    code: 'html_slide_count',
    level: 'error',
    passed: slideOk,
    value: slideCount,
    threshold: 1,
  });
  if (!slideOk) issues.push('no element with class="slide" found');

  const canvas = slideCanvasDeclarations(css);
  const canvasOk =
    canvas.some((rule) => /width\s*:\s*1280px/iu.test(rule)) &&
    canvas.some((rule) => /height\s*:\s*720px/iu.test(rule)) &&
    canvas.some((rule) => /overflow\s*:\s*hidden/iu.test(rule));
  checks.push({
    code: 'html_canvas',
    level: 'error',
    passed: canvasOk,
    detail: canvasOk ? undefined : 'expected .slide { width:1280px; height:720px; overflow:hidden }',
  });
  if (!canvasOk) issues.push('missing fixed 1280x720 overflow:hidden .slide canvas');

  const blacklisted = FONT_FAMILY_BLACKLIST.filter((family) => css.includes(family));
  checks.push({
    code: 'html_font_blacklist',
    level: 'error',
    passed: blacklisted.length === 0,
    detail: blacklisted.join(', ') || undefined,
  });
  if (blacklisted.length > 0) issues.push(`blacklisted font family: ${blacklisted.join(', ')}`);

  const viewportUnits = /\b\d+(?:\.\d+)?(?:vw|vh)\b/iu.test(css);
  checks.push({
    code: 'html_viewport_units',
    level: 'error',
    passed: !viewportUnits,
  });
  if (viewportUnits) issues.push('viewport units (vw/vh) are not allowed');

  const forbiddenHits = FORBIDDEN_CSS.filter((rule) => rule.pattern.test(css)).map(
    (rule) => rule.label,
  );
  checks.push({
    code: 'html_forbidden_css',
    level: 'error',
    passed: forbiddenHits.length === 0,
    detail: forbiddenHits.join(', ') || undefined,
  });
  if (forbiddenHits.length > 0) issues.push(`forbidden CSS: ${forbiddenHits.join(', ')}`);

  const unsupportedGradient = /(?:radial|conic)-gradient\(/iu.test(css);
  checks.push({
    code: 'html_gradient',
    level: 'warn',
    passed: !unsupportedGradient,
    detail: unsupportedGradient
      ? 'only linear-gradient is converted natively; the exporter falls back to an image'
      : undefined,
  });

  const layoutLists = findLayoutLists(html);
  checks.push({
    code: 'html_layout_list',
    level: 'error',
    passed: layoutLists.length === 0,
    detail:
      layoutLists.length > 0
        ? `use div rows for agenda/contents layouts; dom-to-pptx merges <ul>/<ol> into one text box and drops per-item borders: ${layoutLists.join(', ')}`
        : undefined,
  });
  if (layoutLists.length > 0) {
    issues.push(
      `layout list (${layoutLists.join(', ')}): dom-to-pptx merges <ul>/<ol> into one text box, so per-item borders and flex gaps disappear; render each row as a <div> and draw separators as elements`,
    );
  }

  return {
    passed: checks.filter((check) => check.level === 'error').every((check) => check.passed),
    checks,
    issues,
    slideCount,
  };
}

// dom-to-pptx has a dedicated <ul>/<ol> branch that flattens every <li> into
// paragraphs of a single text box. Per-<li> borders/backgrounds are never
// emitted and inline gaps collapse, which silently breaks agenda/contents
// layouts. Plain bullet lists are fine there; only detect lists used as a
// layout: an item carrying its own border/background, or a styled number run.
const LAYOUT_LIST_RE = /<(ul|ol)\b([^>]*)>([\s\S]*?)<\/\1>/giu;
const LI_RE = /<li\b([^>]*)>([\s\S]*?)<\/li>/giu;

export function findLayoutLists(html: string): string[] {
  const hits: string[] = [];
  for (const match of html.matchAll(LAYOUT_LIST_RE)) {
    const attrs = match[2] ?? '';
    const body = match[3] ?? '';
    const className = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/iu.exec(attrs);
    const label = className?.[1] ?? className?.[2] ?? match[1] ?? 'list';
    const hasNumberedRun = /<(?:strong|b)\b[^>]*>\s*\d{1,2}\s*<\/(?:strong|b)>/iu.test(body);
    const hasItemBox = /<li\b[^>]*\bstyle\s*=\s*(?:"[^"]*(?:border|background)[^"]*"|'[^']*(?:border|background)[^']*')/iu.test(
      body,
    );
    const items = [...body.matchAll(LI_RE)];
    const hasSpanNumber = items.some((item) =>
      /<span\b[^>]*\bclass\s*=\s*(?:"[^"]*(?:num|number|no|index|idx)[^"]*"|'[^']*(?:num|number|no|index|idx)[^']*')[^>]*>\s*\d{1,2}\s*<\/span>/iu.test(
        item[2] ?? '',
      ),
    );
    // Deliberately do NOT sniff leading digits: ordinary prose items such as
    // "11 月完成剩余 1 家跨境联调上线" also start with a number and export fine.
    if (hasNumberedRun || hasItemBox || hasSpanNumber) hits.push(label);
  }
  return hits;
}

function extractCss(html: string): string {
  const blocks = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/giu) ?? [];
  return blocks
    .map((block) => block.replace(/^<style\b[^>]*>/iu, '').replace(/<\/style>$/iu, ''))
    .join('\n');
}

function slideCanvasDeclarations(css: string): string[] {
  // Match `.slide` and compound selectors such as `.slide.cover`; the canvas
  // contract is normally declared on the base class only.
  return [...css.matchAll(/\.slide(?:\.[\w-]+)*\s*\{([^}]*)\}/giu)].map(
    (match) => match[1] ?? '',
  );
}

export function countRootSlides(html: string): number {
  let count = 0;
  for (const match of html.matchAll(ELEMENT_WITH_CLASS_RE)) {
    const classes = (match[2] ?? match[3] ?? '').trim().split(/\s+/u);
    if (classes.includes('slide')) count += 1;
  }
  return count;
}
