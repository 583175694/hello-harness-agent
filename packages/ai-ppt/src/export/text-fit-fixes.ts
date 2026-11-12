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
 * 单行小标签（“已商品化”“反直觉结论”）在 PPTX 里被折成两行。
 *
 * 对浏览器里本来就是单行的短文本补 `white-space: nowrap`，让导出器输出
 * `wrap="none"`。不能只处理带底色的元素：`.kv` 这类 flex 行里的普通
 * 数字/标签没有背景色，同样会因为 PowerPoint 字宽略大而折行。
 * 不要再改宽度：表格单元格的宽度会被导出器当成列宽，列宽之和超出画布，
 * 表现为 PPTX 整体偏宽、换行。也不要改 display：badge 等元素依赖父级
 * flex/grid 布局做居中，改成 block 会丢失对齐，标签还会被压成固定宽度。
 * 普通段落不动，避免把多行正文拉宽。
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
        const isInlineTextOnly = (element: HTMLElement): boolean => {
          for (const child of Array.from(element.children) as HTMLElement[]) {
            // <br> 是作者显式换行，不能改成单行。
            if (child.tagName.toUpperCase() === 'BR') return false;
            if (!window.getComputedStyle(child).display.includes('inline')) return false;
            if (!isInlineTextOnly(child)) return false;
          }
          return true;
        };

        let count = 0;
        for (const element of Array.from(document.querySelectorAll<HTMLElement>('.slide *'))) {
          // 导出器会把“只有行内子元素”的节点合成一个文本框，
          // 例如 `<span class="mid">8,791 <span class="up">+19.5%</span></span>`。
          // 这种父节点也要补 nowrap，否则整段仍会在 PPTX 里折行。
          if (!isInlineTextOnly(element)) continue;
          const text = element.textContent?.trim() ?? '';
          if (!text || text.length > 24) continue;

          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;

          // 带底色的短标签（胶囊/徽章）在浏览器里可能比一行略高，仍然需要
          // 命中；普通文本则要求浏览器里确实只有一行，避免把多行正文拉成单行。
          const background = style.backgroundColor;
          const hasBackground =
            background !== 'transparent' &&
            background !== 'rgba(0, 0, 0, 0)' &&
            background !== 'rgba(0,0,0,0)';

          const fontSize = Number.parseFloat(style.fontSize);
          const lineHeight = Number.parseFloat(style.lineHeight);
          const lineBox = Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.5;
          const isSingleLine = Number.isFinite(lineBox) && rect.height <= lineBox * 1.35;
          if (!hasBackground && !isSingleLine) continue;

          // 只禁止换行。宽度与 display 必须保持原样：固定宽度会破坏表格列宽，
          // display:block 会破坏 flex/grid 居中。
          element.style.setProperty('white-space', 'nowrap');
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
