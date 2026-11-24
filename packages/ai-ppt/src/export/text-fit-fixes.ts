import { readFile, writeFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launchChromium } from '../preflight/browser.js';

export type TextFitFixesOptions = {
  browser?: Browser;
};

export type TextFitFixesResult = {
  html: string;
  adjusted: number;
};

/**
 * dom-to-pptx 用浏览器 rect 估算文字框宽度，跨字体/字间距时会偏小，
 * 单行小标签（“已商品化”“12 页 · 指数 / 板块 / 个股”）在 PPTX 里被折成两行；
 * 同时 flex `justify-content: space-between` 推到右侧的辅助文字因未声明
 * `text-align: right` 会被导出为左对齐窄框，字体回退后向右溢出且右边界不齐。
 *
 * 本模块在导出前做两项最小干预：
 *   1. 对浏览器里本来就是单行的短文本（含带边框或带底色的标签）补
 *      `white-space: nowrap`，让导出器输出 `wrap="none"`；单行判定扣除
 *      padding/border 并结合 Range 行盒数，避免把带内边距的单行边框标签误判成多行。
 *   2. 对水平 flex 行里贴近右边缘的最后一个短文本补 `text-align: right`，
 *      让导出器输出 `algn="r"`，配合后处理锁定右边界。
 *
 * 不要改宽度与 display：固定宽度会破坏表格列宽，display:block 会破坏 flex/grid 居中。
 */
export async function applySingleLineFixes(
  htmlPath: string,
  options: TextFitFixesOptions = {},
): Promise<TextFitFixesResult> {
  const ownedBrowser = options.browser ? undefined : await launchChromium();
  const browser = options.browser ?? ownedBrowser!;
  try {
    const html = await readFile(htmlPath, 'utf8');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const adjusted = await page.evaluate(() => {
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

        const isInlineTextOnly = (element: HTMLElement): boolean => {
          for (const child of Array.from(element.children) as HTMLElement[]) {
            // <br> 是作者显式换行，不能改成单行。
            if (child.tagName.toUpperCase() === 'BR') return false;
            if (!window.getComputedStyle(child).display.includes('inline')) return false;
            if (!isInlineTextOnly(child)) return false;
          }
          return true;
        };

        const countRenderedTextLines = (element: HTMLElement): number => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          const lineTops: number[] = [];
          let current = walker.nextNode();
          while (current) {
            if ((current.nodeValue ?? '').trim().length > 0) {
              const range = document.createRange();
              range.selectNodeContents(current);
              for (const r of Array.from(range.getClientRects())) {
                if (r.width <= 0 || r.height <= 0) continue;
                const bucket = lineTops.find((top) => Math.abs(top - r.top) <= Math.max(4, r.height * 0.4));
                if (bucket === undefined) lineTops.push(r.top);
              }
              range.detach();
            }
            current = walker.nextNode();
          }
          return lineTops.length;
        };

        const shouldAlignRightInFlex = (
          element: HTMLElement,
          style: CSSStyleDeclaration,
          rect: DOMRect,
        ): boolean => {
          const align = style.textAlign.trim().toLowerCase();
          if (align !== 'left' && align !== 'start') return false;

          const parent = element.parentElement;
          if (!parent) return false;
          const parentStyle = window.getComputedStyle(parent);
          if (!parentStyle.display.includes('flex')) return false;
          if (parentStyle.flexDirection.startsWith('column')) return false;

          const visibleSiblings = (Array.from(parent.children) as HTMLElement[]).filter((child) => {
            if (child.hasAttribute('data-ppt-border-bar')) return false;
            const cs = window.getComputedStyle(child);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'absolute') {
              return false;
            }
            const r = child.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          if (visibleSiblings.length < 2) return false;
          if (visibleSiblings[visibleSiblings.length - 1] !== element) return false;

          const justify = parentStyle.justifyContent.trim().toLowerCase();
          const pushedRight =
            justify === 'space-between' ||
            justify === 'flex-end' ||
            justify === 'end' ||
            element.style.marginLeft === 'auto';
          if (!pushedRight) return false;

          const parentRect = parent.getBoundingClientRect();
          const padRight = Number.parseFloat(parentStyle.paddingRight) || 0;
          const borderRight = Number.parseFloat(parentStyle.borderRightWidth) || 0;
          const contentRight = parentRect.right - padRight - borderRight;
          return Math.abs(contentRight - rect.right) <= 6;
        };

        let count = 0;
        for (const element of Array.from(document.querySelectorAll<HTMLElement>('.slide *'))) {
          if (element.hasAttribute('data-ppt-border-bar')) continue;
          // 跳过表格单元格与列表项本身：单元格改 nowrap 会撑宽表格列，
          // <li> 由父级 <ul>/<ol> 统一导出，无需逐项干预。
          const tag = element.tagName.toUpperCase();
          if (tag === 'TD' || tag === 'TH' || tag === 'LI') continue;

          // 导出器会把“只有行内子元素”的节点合成一个文本框，
          // 例如 `<span class="mid">8,791 <span class="up">+19.5%</span></span>`。
          // 这种父节点也要补 nowrap，否则整段仍会在 PPTX 里折行。
          if (!isInlineTextOnly(element)) continue;
          const text = element.textContent?.trim() ?? '';
          if (!text) continue;

          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;

          const hasBackground = isVisibleColor(style.backgroundColor);
          const hasBorder = hasVisibleBorder(style);

          // 扣除上下 padding 和 border 再比较行高，并结合 Range 行盒数，
          // 避免把带 padding 的透明背景边框标签误判为多行文本。
          const padTop = Number.parseFloat(style.paddingTop) || 0;
          const padBottom = Number.parseFloat(style.paddingBottom) || 0;
          const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
          const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
          const contentHeight = Math.max(0, rect.height - padTop - padBottom - borderTop - borderBottom);

          const fontSize = Number.parseFloat(style.fontSize);
          const lineHeight = Number.parseFloat(style.lineHeight);
          const lineBox = Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.5;
          const renderedLines = countRenderedTextLines(element);
          const isSingleLine =
            renderedLines === 1 ||
            (renderedLines === 0 && Number.isFinite(lineBox) && contentHeight <= lineBox * 1.35);

          // 只要浏览器实测就是单行（不限 24 字），就应补 nowrap 防止 WPS 字体略宽
          // 导致末尾 1-2 字折行压到下一行；实测多行（renderedLines > 1）绝不改动。
          if (renderedLines > 1) continue;
          if (!hasBackground && !hasBorder && !isSingleLine) continue;
          // 无 Range 行盒结果且仅靠背景/边框命中时，仍只兜底短标签（<= 24 字）。
          if (!isSingleLine && text.length > 24) continue;

          // 只禁止换行。宽度与 display 必须保持原样：固定宽度会破坏表格列宽，
          // display:block 会破坏 flex/grid 居中。
          element.style.setProperty('white-space', 'nowrap');

          // flex 右侧贴边的短辅助文字补齐 text-align: right，避免导出为 algn="l" 后
          // 字体回退导致右边界参差不齐。
          if (text.length <= 24 && shouldAlignRightInFlex(element, style, rect)) {
            element.style.setProperty('text-align', 'right');
          }

          count += 1;
        }
        return count;
      });
      if (adjusted === 0) return { html, adjusted };
      const patched = await page.content();
      await writeFile(htmlPath, patched, 'utf8');
      return { html: patched, adjusted };
    } finally {
      await page.close();
    }
  } finally {
    await ownedBrowser?.close();
  }
}
