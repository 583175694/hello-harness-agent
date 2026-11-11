import { FONT_FAMILY, FONT_FAMILY_BLACKLIST, type DeckPlan, type ExportReportCheck } from '../types.js';
import { countTablesInPlan } from '../render/render-deck.js';

const FORBIDDEN_CSS =
  /(?:clip-path|backdrop-filter|mix-blend-mode|\bfilter\s*:|mask\s*:|position\s*:\s*fixed)/i;

export type F1StaticResult = {
  passed: boolean;
  checks: ExportReportCheck[];
  issues: string[];
};

export function runF1StaticChecks(html: string, plan: DeckPlan): F1StaticResult {
  const checks: ExportReportCheck[] = [];
  const issues: string[] = [];

  const slideCount = html.match(/<section class="slide"/g)?.length ?? 0;
  const expectedSlides = plan.slides.length;
  const slideOk = slideCount === expectedSlides;
  checks.push({
    code: 'slide_count',
    level: 'error',
    passed: slideOk,
    value: slideCount,
    threshold: expectedSlides,
  });
  if (!slideOk) issues.push(`slide count ${slideCount} != plan ${expectedSlides}`);

  const canvasOk =
    /\.slide\s*\{[^}]*width:\s*1280px/i.test(html) &&
    /\.slide\s*\{[^}]*height:\s*720px/i.test(html) &&
    /\.slide\s*\{[^}]*overflow:\s*hidden/i.test(html);
  checks.push({
    code: 'canvas_overflow',
    level: 'error',
    passed: canvasOk,
  });
  if (!canvasOk) issues.push('missing 1280x720 overflow:hidden on .slide');

  const fontOk =
    html.includes(`font-family: ${FONT_FAMILY}`) &&
    FONT_FAMILY_BLACKLIST.every((banned) => !html.includes(banned));
  checks.push({ code: 'font_family', level: 'error', passed: fontOk });
  if (!fontOk) issues.push('font-family contract violation or blacklist hit');

  const htmlTables = html.match(/<table\b/g)?.length ?? 0;
  const planTables = countTablesInPlan(plan);
  const tableOk = htmlTables === planTables;
  checks.push({
    code: 'table_count',
    level: 'error',
    passed: tableOk,
    value: htmlTables,
    threshold: planTables,
  });
  if (!tableOk) issues.push(`html tables ${htmlTables} != plan ${planTables}`);

  const forbidden = FORBIDDEN_CSS.test(html);
  checks.push({ code: 'forbidden_css', level: 'error', passed: !forbidden });
  if (forbidden) issues.push('forbidden CSS detected');

  const passed = checks.filter((c) => c.level === 'error').every((c) => c.passed);
  return { passed, checks, issues };
}
