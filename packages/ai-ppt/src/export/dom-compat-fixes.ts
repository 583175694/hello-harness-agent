import { readFile, writeFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launchChromium } from '../preflight/browser.js';

export type DomCompatFixesOptions = {
  /** 复用调用方已有的浏览器，避免导出链路重复启动 Chromium。 */
  browser?: Browser;
};

export type DomCompatFixesResult = {
  html: string;
  /** 被拆成独立 flex 行以保留圆形序号外观的容器数量。 */
  expandedBadgeRows: number;
  /** 段内被降级为高亮底色的圆角/边框行内胶囊数量。 */
  flattenedPills: number;
  /** 表格单元格内被补入 <br> 的 block 子元素数量。 */
  insertedTableBreaks: number;
  /** 被替换为 <span data-ppt-bar-box> 以绕开 FontAwesome 图标分支的纯图形空 <i> 数量。 */
  replacedIconBars: number;
};

/**
 * 修复 dom-to-pptx 在复杂现代 HTML 上的四项结构性兼容缺陷：
 *   1. `<br>` 分隔的行首圆形徽章（如 `.tick`）：拆成独立 `display: flex` 行，
 *      既保留圆形序号外观，又避免后续行内降级把圆圈压成方块；
 *   2. 段内行内胶囊（`<span class="pill">` 带 `border-radius`/`border`）：会让
 *      `isTextContainer()` 返回 `false`，导致整段多行文字拆成多个大矩形大面积重叠；
 *      去掉段内胶囊的圆角与边框（保留底色）并在前补一个空格，整段合并为单个文本框；
 *   3. 表格 `<td>`/`<th>` 内 `display: block` 子元素（如 `<s>` 副标题）：`dom-to-pptx`
 *      忽略了单元格内的块级换行，需在非首个 block 子元素前补 `<br>`；
 *   4. 纯图形空 `<i>`（例如 CSS 柱状图 `<i style="height:32px">`）：会被硬编码当成
 *      FontAwesome 图标并覆写 `margin: 0`；替换为保留计算样式的 `<span data-ppt-bar-box>`
 *      （不用 `<div>` 避免误命中 `.bars div` 后代选择器）。
 */
export async function applyDomCompatFixes(
  htmlPath: string,
  options: DomCompatFixesOptions = {},
): Promise<DomCompatFixesResult> {
  const ownedBrowser = options.browser ? undefined : await launchChromium();
  const browser = options.browser ?? ownedBrowser!;
  try {
    const html = await readFile(htmlPath, 'utf8');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const result = await page.evaluate(runDomCompatFixesInPage);
      if (
        result.expandedBadgeRows === 0 &&
        result.flattenedPills === 0 &&
        result.insertedTableBreaks === 0 &&
        result.replacedIconBars === 0
      ) {
        return { html, ...result };
      }
      const patched = await page.content();
      await writeFile(htmlPath, patched, 'utf8');
      return { html: patched, ...result };
    } finally {
      await page.close();
    }
  } finally {
    await ownedBrowser?.close();
  }
}

function runDomCompatFixesInPage(): {
  expandedBadgeRows: number;
  flattenedPills: number;
  insertedTableBreaks: number;
  replacedIconBars: number;
} {
  const isVisibleColor = (color: string): boolean => {
    const normalized = color.trim().toLowerCase();
    if (!normalized || normalized === 'transparent') return false;
    const rgba = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/.exec(normalized);
    if (rgba && Number.parseFloat(rgba[1] ?? '1') <= 0) return false;
    return true;
  };

  const hasVisibleBorder = (style: CSSStyleDeclaration): boolean => {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0;
      const bStyle = style.getPropertyValue(`border-${side}-style`).trim().toLowerCase();
      const color = style.getPropertyValue(`border-${side}-color`).trim();
      if (width > 0 && bStyle !== 'none' && bStyle !== 'hidden' && isVisibleColor(color)) {
        return true;
      }
    }
    return false;
  };

  const hasBorderRadius = (style: CSSStyleDeclaration): boolean =>
    (Number.parseFloat(style.borderTopLeftRadius) || 0) > 0 ||
    (Number.parseFloat(style.borderTopRightRadius) || 0) > 0 ||
    (Number.parseFloat(style.borderBottomLeftRadius) || 0) > 0 ||
    (Number.parseFloat(style.borderBottomRightRadius) || 0) > 0;

  const hasInlineChildrenOnly = (element: HTMLElement): boolean => {
    for (const child of Array.from(element.children) as HTMLElement[]) {
      const display = window.getComputedStyle(child).display;
      if (!display.includes('inline')) return false;
    }
    return true;
  };

  const hasNonEmptyDirectTextNode = (element: HTMLElement): boolean =>
    Array.from(element.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim().length > 0,
    );

  const isCircleBadge = (el: HTMLElement): boolean => {
    const style = window.getComputedStyle(el);
    if (!style.display.includes('inline')) return false;
    if (!isVisibleColor(style.backgroundColor)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 12 || rect.width > 28 || rect.height < 12 || rect.height > 28) return false;
    if (Math.abs(rect.width - rect.height) > 2) return false;
    const minSide = Math.min(rect.width, rect.height);
    const tl = Number.parseFloat(style.borderTopLeftRadius) || 0;
    const tr = Number.parseFloat(style.borderTopRightRadius) || 0;
    const br = Number.parseFloat(style.borderBottomRightRadius) || 0;
    const bl = Number.parseFloat(style.borderBottomLeftRadius) || 0;
    return Math.min(tl, tr, br, bl) >= minSide / 2 - 1;
  };

  // 1. 拆分带 `<br>` 和行首圆形徽章的容器，保留圆形序号外观
  let expandedBadgeRows = 0;
  for (const host of Array.from(document.querySelectorAll<HTMLElement>('.slide *'))) {
    if (host.hasAttribute('data-ppt-badge-row')) continue;
    const hostStyle = window.getComputedStyle(host);
    if (hostStyle.display.includes('flex') || hostStyle.display.includes('grid')) continue;
    if (!hasInlineChildrenOnly(host)) continue;

    const hasBr = Array.from(host.children).some((c) => c.tagName.toUpperCase() === 'BR');
    if (!hasBr) continue;

    // 按 <br> 切分 childNodes 为若干视觉行
    const lines: ChildNode[][] = [[]];
    for (const node of Array.from(host.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toUpperCase() === 'BR') {
        lines.push([]);
      } else {
        lines[lines.length - 1]!.push(node);
      }
    }
    const nonEmptyLines = lines.filter((nodes) =>
      nodes.some(
        (n) =>
          (n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim().length > 0) ||
          n.nodeType === Node.ELEMENT_NODE,
      ),
    );
    if (nonEmptyLines.length < 2) continue;

    const allStartWithBadge = nonEmptyLines.every((nodes) => {
      const meaningful = nodes.filter(
        (n) => !(n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim().length === 0),
      );
      return (
        meaningful.length >= 2 &&
        meaningful[0]!.nodeType === Node.ELEMENT_NODE &&
        isCircleBadge(meaningful[0] as HTMLElement)
      );
    });
    if (!allStartWithBadge) continue;

    const rows: HTMLElement[] = [];
    for (let i = 0; i < nonEmptyLines.length; i += 1) {
      const nodes = nonEmptyLines[i]!;
      const meaningful = nodes.filter(
        (n) => !(n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim().length === 0),
      );
      const badge = meaningful[0] as HTMLElement;
      const badgeStyle = window.getComputedStyle(badge);
      const mr = Number.parseFloat(badgeStyle.marginRight) || 0;
      const gap = mr > 0 ? mr : 6;

      // 固化圆形徽章样式，避免放到 flex 行后样式变化
      for (const prop of [
        'width',
        'height',
        'background-color',
        'color',
        'border-radius',
        'font-size',
        'font-weight',
        'line-height',
        'text-align',
      ] as const) {
        const val = badgeStyle.getPropertyValue(prop);
        if (val) badge.style.setProperty(prop, val);
      }
      badge.style.setProperty('display', 'inline-flex');
      badge.style.setProperty('align-items', 'center');
      badge.style.setProperty('justify-content', 'center');
      badge.style.setProperty('flex', '0 0 auto');
      badge.style.setProperty('margin-right', '0px');
      badge.style.setProperty('margin-top', '2px');
      badge.style.setProperty('white-space', 'nowrap');

      const row = document.createElement('div');
      row.setAttribute('data-ppt-badge-row', '');
      row.style.setProperty('display', 'flex');
      row.style.setProperty('align-items', 'flex-start');
      row.style.setProperty('gap', `${gap}px`);
      row.style.setProperty('margin-bottom', i === nonEmptyLines.length - 1 ? '0px' : '4px');

      const textWrap = document.createElement('span');
      textWrap.style.setProperty('flex', '1 1 auto');
      textWrap.style.setProperty('display', 'block');
      for (const node of nodes) {
        if (node === badge) continue;
        if (node.nodeType === Node.TEXT_NODE && (node.nodeValue ?? '').trim().length === 0) continue;
        textWrap.appendChild(node);
      }

      row.append(badge, textWrap);
      rows.push(row);
    }

    host.replaceChildren(...rows);
    expandedBadgeRows += 1;
  }

  // 2. 段内行内胶囊降级为高亮底色，避免 isTextContainer 失败引发文本块重叠
  let flattenedPills = 0;
  for (const host of Array.from(document.querySelectorAll<HTMLElement>('.slide *'))) {
    if (host.hasAttribute('data-ppt-badge-row') || host.closest('[data-ppt-badge-row]')) continue;
    if (host.children.length === 0) continue;
    const hostDisplay = window.getComputedStyle(host).display;
    if (hostDisplay.includes('flex') || hostDisplay.includes('grid')) continue;
    if (!hasNonEmptyDirectTextNode(host)) continue;
    if (!hasInlineChildrenOnly(host)) continue;

    for (const child of Array.from(host.querySelectorAll<HTMLElement>('*'))) {
      const childStyle = window.getComputedStyle(child);
      if (!childStyle.display.includes('inline')) continue;
      if ((child.textContent?.trim().length ?? 0) === 0) continue;
      if (!hasInlineChildrenOnly(child)) continue;
      if (!hasBorderRadius(childStyle) && !hasVisibleBorder(childStyle)) continue;

      child.style.setProperty('border-radius', '0px');
      child.style.setProperty('border-width', '0px');
      child.style.setProperty('border-style', 'none');
      child.style.setProperty('padding', '0px');
      child.style.setProperty('margin', '0px');

      const prev = child.previousSibling;
      if (prev && (prev.textContent ?? '').length > 0 && !/\s$/u.test(prev.textContent ?? '')) {
        child.before(document.createTextNode(' '));
      }
      flattenedPills += 1;
    }
  }

  // 3. 表格单元格内 display: block 子元素前补 <br>，避免主标题和副标题挤在同一行
  let insertedTableBreaks = 0;
  for (const cell of Array.from(document.querySelectorAll<HTMLElement>('.slide td, .slide th'))) {
    for (const child of Array.from(cell.children) as HTMLElement[]) {
      if (child.tagName.toUpperCase() === 'BR') continue;
      const childStyle = window.getComputedStyle(child);
      if (childStyle.display !== 'block') continue;

      let hasPrevContent = false;
      let prev = child.previousSibling;
      while (prev) {
        if (prev.nodeType === Node.TEXT_NODE && (prev.nodeValue ?? '').trim().length > 0) {
          hasPrevContent = true;
          break;
        }
        if (prev.nodeType === Node.ELEMENT_NODE) {
          if ((prev as HTMLElement).tagName.toUpperCase() === 'BR') break;
          hasPrevContent = true;
          break;
        }
        prev = prev.previousSibling;
      }
      if (!hasPrevContent) continue;

      child.before(document.createElement('br'));
      child.style.setProperty('display', 'inline');
      insertedTableBreaks += 1;
    }
  }

  // 4. 纯图形空 <i> 替换为 <span data-ppt-bar-box>，绕开 FontAwesome 与 .bars div 选择器
  let replacedIconBars = 0;
  const hasContent = (c: string): boolean =>
    Boolean(c && c !== 'none' && c !== 'normal' && c !== '""' && c !== "''");
  const iconClassRe = /(?:^|\s)(?:fa-|fas|far|fab|bi-|icon|material-icons)/i;
  const barStyleProps = [
    'display',
    'width',
    'height',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'background-color',
    'background-image',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
    'box-sizing',
    'position',
    'left',
    'top',
    'right',
    'bottom',
  ] as const;

  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.slide i'))) {
    if ((el.textContent?.trim().length ?? 0) > 0) continue;
    if (el.children.length > 0) continue;
    const cls = el.getAttribute('class') ?? '';
    if (iconClassRe.test(cls)) continue;

    const beforeContent = window.getComputedStyle(el, '::before').content;
    const afterContent = window.getComputedStyle(el, '::after').content;
    if (hasContent(beforeContent) || hasContent(afterContent)) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    const style = window.getComputedStyle(el);
    const hasBg = isVisibleColor(style.backgroundColor) || (style.backgroundImage && style.backgroundImage !== 'none');
    if (!hasBg) continue;

    const span = document.createElement('span');
    span.setAttribute('data-ppt-bar-box', '');
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-')) {
        span.setAttribute(attr.name, attr.value);
      }
    }
    for (const prop of barStyleProps) {
      const value = style.getPropertyValue(prop);
      if (value) span.style.setProperty(prop, value);
    }
    el.replaceWith(span);
    replacedIconBars += 1;
  }

  return { expandedBadgeRows, flattenedPills, insertedTableBreaks, replacedIconBars };
}
