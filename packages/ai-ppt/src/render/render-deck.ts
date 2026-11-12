import { defaultStyleSpec, layoutCatalog } from '../data/load-data.js';
import {
  deckPlanSchema,
  type DeckPlan,
  type StyleSpec,
  type TableData,
  FONT_FAMILY,
} from '../types.js';

export { defaultStyleSpec, layoutCatalog };

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function asString(value: unknown, key: string): string {
  if (typeof value === 'string') return value;
  throw new Error(`Expected string for content.${key}`);
}

function asStringArray(value: unknown, key: string): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  throw new Error(`Expected string[] for content.${key}`);
}

// 版式里的副标题、页脚、行动项等是可选内容；模型省略时按空值渲染，
// 而不是让一份通过 schema 校验的 deck plan 在渲染阶段直接抛错。
function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function asTable(value: unknown, key: string): TableData {
  if (
    value &&
    typeof value === 'object' &&
    'headers' in value &&
    'rows' in value &&
    Array.isArray((value as TableData).headers) &&
    Array.isArray((value as TableData).rows)
  ) {
    return value as TableData;
  }
  throw new Error(`Expected table for content.${key}`);
}

function buildTableHtml(table: TableData, style: StyleSpec): string {
  const headerCells = table.headers
    .map((h) => `<th style="background:${style.colors.tableHeader}">${escapeHtml(h)}</th>`)
    .join('');
  const bodyRows = table.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table class="data-table">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>`;
}

function renderSlideBody(slide: DeckPlan['slides'][number], style: StyleSpec): string {
  const c = slide.content;
  switch (slide.layoutId) {
    case 'cover': {
      const title = asString(c.title, 'title');
      const subtitle = optionalString(c.subtitle);
      const meta = optionalString(c.meta);
      return `
        <div class="cover-hero">
          <h1 class="cover-title">${escapeHtml(title)}</h1>
          <p class="cover-sub">${escapeHtml(subtitle)}</p>
          <p class="cover-meta">${escapeHtml(meta)}</p>
        </div>`;
    }
    case 'agenda': {
      const items = asStringArray(c.items, 'items');
      const list = items
        .map(
          (item, index) =>
            `<div class="agenda-row"><span class="agenda-num">${String(index + 1).padStart(2, '0')}</span><span class="agenda-text">${escapeHtml(item)}</span></div>`,
        )
        .join('');
      return `<div class="agenda-list">${list}</div>`;
    }
    case 'section': {
      const number = asString(c.number, 'number');
      const title = asString(c.title, 'title');
      return `
        <div class="section-wrap">
          <span class="section-num">${escapeHtml(number)}</span>
          <h2 class="section-title">${escapeHtml(title)}</h2>
        </div>`;
    }
    case 'three-col': {
      const cols = asStringArray(c.columns, 'columns');
      const colTitles = optionalStringArray(c.columnTitles);
      const cards = cols
        .map((body, i) => {
          const t = colTitles[i] ?? `要点 ${i + 1}`;
          const lines = body.split('\n').map((line) => `<p>${escapeHtml(line)}</p>`).join('');
          return `<div class="col-card"><h3>${escapeHtml(t)}</h3><div class="col-body">${lines}</div></div>`;
        })
        .join('');
      return `<div class="three-col">${cards}</div>`;
    }
    case 'table': {
      const table = asTable(c.table, 'table');
      const caption = typeof c.caption === 'string' ? escapeHtml(c.caption) : '';
      return `
        <div class="table-wrap">${buildTableHtml(table, style)}</div>
        ${caption ? `<p class="table-caption">${caption}</p>` : ''}`;
    }
    case 'conclusion': {
      const points = asStringArray(c.points, 'points');
      const actions = optionalStringArray(c.actions);
      const pointHtml = points
        .map(
          (p, i) =>
            `<div class="point-row"><span class="point-num">${i + 1}</span><span>${escapeHtml(p)}</span></div>`,
        )
        .join('');
      const actionHtml = actions
        .map((a) => `<li>${escapeHtml(a)}</li>`)
        .join('');
      return `
        <div class="conclusion-points">${pointHtml}</div>
        <div class="actions-block">
          <p class="actions-label">下一步行动</p>
          <ul class="actions-list">${actionHtml}</ul>
        </div>`;
    }
    default:
      return `<p>${escapeHtml(slide.claim)}</p>`;
  }
}

function slideTitle(slide: DeckPlan['slides'][number]): string {
  const t = slide.content.title;
  if (typeof t === 'string' && t.length > 0) return t;
  return slide.claim;
}

function slideHeader(slide: DeckPlan['slides'][number], index: number, style: StyleSpec): string {
  if (slide.layoutId === 'cover' || slide.layoutId === 'section') {
    return '';
  }
  const title = slideTitle(slide);
  const idx = String(index + 1).padStart(2, '0');
  return `
    <header class="slide-header">
      <h1 class="slide-title">${escapeHtml(title)}</h1>
      <span class="slide-index">${idx}</span>
    </header>`;
}

function slideFooter(plan: DeckPlan, style: StyleSpec): string {
  return `<footer class="slide-footer" style="color:${style.colors.muted}">${escapeHtml(plan.meta.title)}</footer>`;
}

function buildCss(style: StyleSpec): string {
  const t = style.typography;
  const c = style.colors;
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1280px; background: ${c.background}; font-family: ${FONT_FAMILY}; color: ${c.text}; }
    .slide {
      width: 1280px;
      height: 720px;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
      background: ${c.background};
      padding: 0 0 48px 0;
      font-family: ${FONT_FAMILY};
    }
    .slide-header {
      flex: 0 0 auto;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      padding: 40px 80px 16px;
      border-bottom: 2px solid ${c.tableHeader};
    }
    .slide-title { font-size: ${t.slideTitle}px; font-weight: 600; line-height: 1.25; max-width: 1000px; }
    .slide-index { font-size: ${t.caption}px; color: ${c.muted}; }
    .slide-body {
      flex: 1 1 auto;
      min-height: 0;
      padding: 24px 80px 8px;
      font-size: ${t.body}px;
      line-height: 1.5;
      overflow: hidden;
    }
    .slide-footer {
      position: absolute;
      left: 80px;
      right: 80px;
      bottom: 20px;
      font-size: ${t.caption}px;
    }
    .cover-hero { padding: 120px 80px; }
    .cover-title { font-size: ${t.coverTitle}px; font-weight: 700; color: ${c.primary}; line-height: 1.2; }
    .cover-sub { margin-top: 24px; font-size: 22px; color: ${c.text}; }
    .cover-meta { margin-top: 48px; font-size: ${t.caption}px; color: ${c.muted}; }
    .agenda-list {
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 100%;
      gap: 28px;
    }
    .agenda-row { font-size: ${t.body}px; display: flex; gap: 16px; align-items: baseline; }
    .agenda-num { color: ${c.accent}; font-weight: 700; min-width: 36px; }
    /* Section pages are intentionally sparse; centre vertically instead of
       leaving the title pinned to the top third. */
    .section-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 80px;
      text-align: center;
    }
    .section-num { display: block; font-size: ${t.sectionNumber}px; font-weight: 700; color: ${c.secondary}; line-height: 1; }
    .section-title { margin-top: 32px; font-size: 36px; font-weight: 600; }
    /* Stretch cards to the usable body height; otherwise a three-point page
       leaves three quarters of the canvas blank. */
    .three-col { display: flex; gap: 24px; height: 100%; align-items: stretch; }
    .col-card {
      flex: 1;
      border: 1px solid ${c.tableHeader};
      border-radius: 8px;
      padding: 20px 16px;
      background: #f8fafc;
      overflow: hidden;
    }
    .col-card h3 { font-size: 20px; color: ${c.primary}; margin-bottom: 16px; }
    .col-body p { margin-bottom: 12px; font-size: 18px; line-height: 1.6; }
    .table-wrap { overflow: hidden; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t.table}px;
    }
    .data-table th, .data-table td {
      border: 1px solid #cbd5e1;
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    .table-caption { margin-top: 12px; font-size: ${t.caption}px; color: ${c.muted}; }
    .conclusion-points {
      display: flex;
      flex-direction: column;
      justify-content: center;
      flex: 1 1 auto;
      min-height: 0;
      gap: 28px;
    }
    .point-row { display: flex; gap: 12px; font-size: ${t.body}px; }
    .point-num {
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      background: ${c.primary};
      color: #fff;
      border-radius: 50%;
      font-size: 14px;
      flex-shrink: 0;
    }
    .actions-block {
      flex: 0 0 auto;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid ${c.tableHeader};
    }
    .actions-label { font-size: 14px; font-weight: 600; color: ${c.accent}; margin-bottom: 8px; }
    .actions-list { list-style: disc; padding-left: 24px; font-size: 15px; }
    .actions-list li { margin-bottom: 6px; }
  `;
}

export function renderDeckToHtml(
  planInput: DeckPlan,
  style: StyleSpec = defaultStyleSpec,
): string {
  const plan = deckPlanSchema.parse(planInput);
  const slidesHtml = plan.slides
    .map((slide, index) => {
      const header = slideHeader(slide, index, style);
      const body = renderSlideBody(slide, style);
      const footer = slide.layoutId === 'cover' ? '' : slideFooter(plan, style);
      return `<section class="slide" data-layout="${slide.layoutId}" data-slide-id="${escapeHtml(slide.id)}">
        ${header}
        <main class="slide-body">${body}</main>
        ${footer}
      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(plan.meta.title)}</title>
  <style>${buildCss(style)}</style>
</head>
<body>
${slidesHtml}
</body>
</html>`;
}

export function countTablesInPlan(plan: DeckPlan): number {
  return plan.slides.filter((s) => s.layoutId === 'table').length;
}
