import { readFile, writeFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launchChromium } from '../preflight/browser.js';

export type PseudoCounterOptions = {
  /** 复用调用方已有的浏览器，避免导出链路重复启动 Chromium。 */
  browser?: Browser;
};

export type PseudoCounterResult = {
  html: string;
  /** 被展开成真实元素的 CSS 计数器伪元素数量。 */
  replacements: number;
};

/**
 * dom-to-pptx 处理伪元素文本有两个副作用：
 *   1. `content: counter(p)` 会被当成字面量，幻灯片上出现 “counter(p)”；
 *   2. `<ol>` 还会自动加一套编号，和伪元素序号叠成 “I. 1”。
 *
 * 导出前用同一个 Chromium 打开 HTML，把带 CSS 计数器的 `::before/::after`
 * 展开成与计算样式一致的绝对定位徽章元素。这样既保留原有圆形序号外观，
 * 又不依赖转换器对伪元素和列表编号的支持。只改这一段 DOM，其余版式不动。
 */
export async function materializePseudoCounters(
  htmlPath: string,
  options: PseudoCounterOptions = {},
): Promise<PseudoCounterResult> {
  const ownedBrowser = options.browser ? undefined : await launchChromium();
  const browser = options.browser ?? ownedBrowser!;
  try {
    const html = await readFile(htmlPath, 'utf8');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const replacements = await page.evaluate(expandCounterPseudoElements);
      if (replacements === 0) return { html, replacements };
      const patched = await page.content();
      await writeFile(htmlPath, patched, 'utf8');
      return { html: patched, replacements };
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
function expandCounterPseudoElements(): number {
  const COUNTED: Array<{ selector: string; pseudo: 'before' | 'after' }> = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[];
    try {
      rules = Array.from(sheet.cssRules ?? []);
    } catch {
      // 跨域样式表读不到规则，跳过。
      continue;
    }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!/counter(s)?\(/iu.test(rule.style.getPropertyValue('content'))) continue;
      const pseudo = /::?(before|after)\s*$/iu.exec(rule.selectorText)?.[1]?.toLowerCase();
      if (pseudo !== 'before' && pseudo !== 'after') continue;
      COUNTED.push({
        selector: rule.selectorText.replace(/::?(before|after)\s*$/iu, '').trim(),
        pseudo,
      });
    }
  }

  const computed = (element: Element, pseudo: string): CSSStyleDeclaration =>
    window.getComputedStyle(element, `::${pseudo}`);

  const copyBadgeStyle = (badge: HTMLElement, style: CSSStyleDeclaration): void => {
    const properties = [
      'position',
      'left',
      'top',
      'right',
      'bottom',
      'width',
      'height',
      'display',
      'align-items',
      'justify-content',
      'background-color',
      'color',
      'border-radius',
      'font-size',
      'font-weight',
      'font-family',
      'line-height',
      'text-align',
      'box-sizing',
    ];
    for (const property of properties) {
      const value = style.getPropertyValue(property);
      if (value) badge.style.setProperty(property, value);
    }
  };

  let replacements = 0;
  for (const { selector, pseudo } of COUNTED) {
    let hosts: Element[];
    try {
      hosts = Array.from(document.querySelectorAll(selector));
    } catch {
      continue;
    }
    for (const [index, host] of hosts.entries()) {
      const pseudoStyle = computed(host, pseudo);
      const badge = document.createElement('span');
      badge.setAttribute('data-ppt-counter-badge', '');
      badge.textContent = String(index + 1);
      copyBadgeStyle(badge, pseudoStyle);

      if (host.tagName === 'LI' && host.parentElement) {
        // 不能只把 <li> 改成 block：dom-to-pptx 仍会按父级 <ol> 生成另一套
        // “I./1.” 编号。把每个列表项换成 flex 行，既保留内部富文本，又让
        // 转换器不再走列表分支；序号由上面的徽章元素负责。
        //
        // 用 flex 而不是绝对定位：演示稿段落会换行，PPTX 的行高与浏览器
        // 不完全一致，绝对定位徽章会压到下一行；flex 的 gap 与 align-start
        // 让徽章始终贴着首行，行高变化也不会重叠。
        const hostStyle = window.getComputedStyle(host);
        const row = document.createElement('div');
        row.setAttribute('data-ppt-counter-row', '');
        row.style.cssText = [
          'display:flex',
          'align-items:flex-start',
          `gap:${hostStyle.paddingLeft || '12px'}`,
          `margin-bottom:${hostStyle.marginBottom}`,
          `font-size:${hostStyle.fontSize}`,
          `line-height:${hostStyle.lineHeight}`,
          `color:${hostStyle.color}`,
        ].join(';');
        badge.style.setProperty('position', 'static');
        badge.style.setProperty('flex', '0 0 auto');
        const text = document.createElement('span');
        text.style.setProperty('flex', '1 1 auto');
        text.innerHTML = host.innerHTML;
        if (pseudo === 'before') row.append(badge, text);
        else row.append(text, badge);
        host.replaceWith(row);
        replacements += 1;
        continue;
      }

      if (pseudo === 'before') host.prepend(badge);
      else host.append(badge);
      replacements += 1;
    }
  }
  return replacements;
}
