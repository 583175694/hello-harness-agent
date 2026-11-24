import { readFile, writeFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launchChromium } from '../preflight/browser.js';

export type DomCompatFixesOptions = {
  /** 复用调用方已有的浏览器，避免导出链路重复启动 Chromium。 */
  browser?: Browser;
};

export type DomCompatFixesResult = {
  html: string;
  /** 段内被降级为高亮底色的圆角/边框行内胶囊数量。 */
  flattenedPills: number;
  /** 被替换为 <div> 以绕开 FontAwesome 图标分支的纯图形空 <i> 数量。 */
  replacedIconBars: number;
};

/**
 * 修复 dom-to-pptx 在复杂现代 HTML 上的两项结构性兼容缺陷：
 *   1. 段内行内胶囊（`<span class="pill">` 带 `border-radius`/`border`）会让
 *      `isTextContainer()` 返回 `false`，导致整段多行文字被拆成多个裸文本节点的
 *      外接矩形而大面积重叠；去掉段内胶囊的圆角与边框（保留底色）即可让整段
 *      合并为单个文本框并以 `<a:highlight>` 呈现高亮。
 *   2. 纯图形空 `<i>`（例如 CSS 柱状图 `<i style="height:32px">`）会被硬编码
 *      当成 FontAwesome 图标并强制覆写 `margin: 0`，清掉 `margin: 0 auto` 导致
 *      柱子偏右且重复截图；将其替换为保留计算样式的 `<div>` 即可正常居中导出。
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
      const { flattenedPills, replacedIconBars } = await page.evaluate(runDomCompatFixesInPage);
      if (flattenedPills === 0 && replacedIconBars === 0) {
        return { html, flattenedPills: 0, replacedIconBars: 0 };
      }
      const patched = await page.content();
      await writeFile(htmlPath, patched, 'utf8');
      return { html: patched, flattenedPills, replacedIconBars };
    } finally {
      await page.close();
    }
  } finally {
    await ownedBrowser?.close();
  }
}

function runDomCompatFixesInPage(): { flattenedPills: number; replacedIconBars: number } {
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

  // 1. 段内行内胶囊降级为高亮底色，避免 isTextContainer 失败引发文本块重叠
  let flattenedPills = 0;
  for (const host of Array.from(document.querySelectorAll<HTMLElement>('.slide *'))) {
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
      flattenedPills += 1;
    }
  }

  // 2. 纯图形空 <i> 替换为 <div>，绕开 dom-to-pptx FontAwesome 图标分支
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

    const div = document.createElement('div');
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-')) {
        div.setAttribute(attr.name, attr.value);
      }
    }
    for (const prop of barStyleProps) {
      const value = style.getPropertyValue(prop);
      if (value) div.style.setProperty(prop, value);
    }
    el.replaceWith(div);
    replacedIconBars += 1;
  }

  return { flattenedPills, replacedIconBars };
}
