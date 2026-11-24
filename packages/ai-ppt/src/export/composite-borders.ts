import { readFile, writeFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launchChromium } from '../preflight/browser.js';

export type CompositeBordersOptions = {
  /** 复用调用方已有的浏览器，避免导出链路重复启动 Chromium。 */
  browser?: Browser;
};

export type CompositeBordersResult = {
  html: string;
  /** 被实体化为独立色块的非均匀边框元素数量。 */
  materialized: number;
};

/**
 * dom-to-pptx 处理“实心背景 + 单侧/非均匀边框”的纯文本容器（例如底部
 * `.callout { background: #fdf6ec; border-left: 4px solid #c99a3e }`）存在
 * 图层顺序缺陷：文本容器的背景 fill 被合并到 `type: 'text'`（zIndex `[..., 0, -1]`），
 * 而单侧边框 SVG 图片的 zIndex 是 `[..., -5e5]`，导致边框被提示条自身背景完全遮盖。
 *
 * 导出前将这些元素的单侧/非均匀边框实体化为绝对定位的纯色块元素，同时把原边框
 * 宽度补入对应侧 padding 保持文字位置不变。这样既彻底解决遮盖问题，又把 SVG
 * 边框升级为原生 PPTX 矢量矩形。
 */
export async function materializeCompositeBorders(
  htmlPath: string,
  options: CompositeBordersOptions = {},
): Promise<CompositeBordersResult> {
  const ownedBrowser = options.browser ? undefined : await launchChromium();
  const browser = options.browser ?? ownedBrowser!;
  try {
    const html = await readFile(htmlPath, 'utf8');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const materialized = await page.evaluate(expandCompositeBordersInPage);
      if (materialized === 0) return { html, materialized };
      const patched = await page.content();
      await writeFile(htmlPath, patched, 'utf8');
      return { html: patched, materialized };
    } finally {
      await page.close();
    }
  } finally {
    await ownedBrowser?.close();
  }
}

/**
 * 在页面上下文里执行；必须是自包含函数，Playwright 会把它序列化后注入。
 */
function expandCompositeBordersInPage(): number {
  const TABLE_TAGS = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD']);
  const SIDES = ['top', 'right', 'bottom', 'left'] as const;
  type Side = (typeof SIDES)[number];

  const isVisibleColor = (color: string): boolean => {
    const normalized = color.trim().toLowerCase();
    if (!normalized || normalized === 'transparent') return false;
    const rgba = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/.exec(normalized);
    if (rgba && Number.parseFloat(rgba[1] ?? '1') <= 0) return false;
    return true;
  };

  const hasNonBlockChildrenOnly = (element: HTMLElement): boolean => {
    for (const child of Array.from(element.children) as HTMLElement[]) {
      const display = window.getComputedStyle(child).display;
      if (!display.includes('inline')) return false;
    }
    return true;
  };

  const readSide = (style: CSSStyleDeclaration, side: Side) => {
    const cap = side.charAt(0).toUpperCase() + side.slice(1);
    const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0;
    const borderStyle = style.getPropertyValue(`border-${side}-style`).trim().toLowerCase();
    const color = style.getPropertyValue(`border-${side}-color`).trim();
    const visible =
      width > 0 &&
      borderStyle !== 'none' &&
      borderStyle !== 'hidden' &&
      isVisibleColor(color);
    return { side, cap, width: visible ? width : 0, style: borderStyle, color, visible };
  };

  let count = 0;
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('.slide *'))) {
    if (TABLE_TAGS.has(element.tagName.toUpperCase())) continue;
    if (element.hasAttribute('data-ppt-border-bar') || element.hasAttribute('data-ppt-border-materialized')) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    // 跳过 0 宽高元素（例如 CSS border 三角形）和极细分隔线。
    if (rect.width < 4 || rect.height < 4) continue;

    const style = window.getComputedStyle(element);
    if (!isVisibleColor(style.backgroundColor)) continue;

    const sides = SIDES.map((side) => readSide(style, side));
    const visibleSides = sides.filter((s) => s.visible);
    if (visibleSides.length === 0) continue;

    // 4 条边完全均匀一致时 dom-to-pptx 会输出原生 shape line，不需要拆分。
    const first = sides[0]!;
    const isUniform = sides.every(
      (s) => s.width === first.width && s.style === first.style && s.color === first.color,
    );
    if (isUniform) continue;

    // 仅处理 solid 边框；虚线/点线仍交回原逻辑。
    if (visibleSides.some((s) => s.style !== 'solid')) continue;

    const isInlineTextHost =
      (element.textContent?.trim().length ?? 0) > 0 && hasNonBlockChildrenOnly(element);

    // 若宿主是纯行内文本容器（例如 `.callout` 内含 `<strong>` + 文本），
    // 直接插入块级色块会破坏 isTextContainer 判定并把行内富文本拆成多个文本框。
    // 先把原有子节点包进一个透明块级 wrapper，保持富文本完整合并。
    if (isInlineTextHost) {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-ppt-border-content', '');
      wrapper.style.setProperty('display', 'block');
      wrapper.style.setProperty('width', '100%');
      while (element.firstChild) {
        wrapper.appendChild(element.firstChild);
      }
      element.appendChild(wrapper);
    }

    if (style.position === 'static') {
      element.style.setProperty('position', 'relative');
    }

    for (const s of visibleSides) {
      const currentPadding = Number.parseFloat(style.getPropertyValue(`padding-${s.side}`)) || 0;
      element.style.setProperty(`border-${s.side}-width`, '0px');
      element.style.setProperty(`border-${s.side}-style`, 'none');
      element.style.setProperty(`padding-${s.side}`, `${currentPadding + s.width}px`);

      const bar = document.createElement('span');
      bar.setAttribute('data-ppt-border-bar', s.side);
      bar.setAttribute('aria-hidden', 'true');
      bar.style.setProperty('position', 'absolute');
      bar.style.setProperty('display', 'block');
      bar.style.setProperty('background-color', s.color);
      bar.style.setProperty('pointer-events', 'none');
      bar.style.setProperty('z-index', '1');

      if (s.side === 'left') {
        bar.style.setProperty('left', '0');
        bar.style.setProperty('top', '0');
        bar.style.setProperty('bottom', '0');
        bar.style.setProperty('width', `${s.width}px`);
      } else if (s.side === 'right') {
        bar.style.setProperty('right', '0');
        bar.style.setProperty('top', '0');
        bar.style.setProperty('bottom', '0');
        bar.style.setProperty('width', `${s.width}px`);
      } else if (s.side === 'top') {
        bar.style.setProperty('left', '0');
        bar.style.setProperty('right', '0');
        bar.style.setProperty('top', '0');
        bar.style.setProperty('height', `${s.width}px`);
      } else {
        bar.style.setProperty('left', '0');
        bar.style.setProperty('right', '0');
        bar.style.setProperty('bottom', '0');
        bar.style.setProperty('height', `${s.width}px`);
      }

      element.prepend(bar);
    }

    element.setAttribute('data-ppt-border-materialized', '');
    count += 1;
  }

  return count;
}
