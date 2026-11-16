import { JSDOM, VirtualConsole } from 'jsdom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const NOISE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'frame',
  'object',
  'embed',
  'svg',
  'canvas',
  '[hidden]',
  '[aria-hidden="true"]',
].join(',');

export type NormalizedUploadedHtml = {
  markdown: string;
  title?: string;
};

/**
 * 将上传的 HTML 规范化为模型可读的 Markdown。
 * 只保留标题、正文、列表、表格等语义内容；脚本、样式、隐藏节点和内联资源不进入正文预算。
 */
export function normalizeUploadedHtml(html: string): NormalizedUploadedHtml {
  // 上传文件不执行脚本或加载外部资源；只关闭 jsdom 对页面 CSS 的解析告警。
  const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
  try {
    const document = dom.window.document;
    const title = document.title.trim() || undefined;
    for (const node of document.querySelectorAll(NOISE_SELECTOR)) node.remove();
    for (const node of document.querySelectorAll<HTMLElement>('[style]')) {
      const style = node.getAttribute('style')?.toLowerCase() ?? '';
      if (style.includes('display:none') || style.includes('visibility:hidden')) node.remove();
    }
    document.head?.remove();

    const turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    });
    turndown.use(gfm);
    turndown.addRule('images-as-alt', {
      filter: 'img',
      replacement: (_content, node) => {
        const alt = (node as HTMLImageElement).alt.trim();
        return alt ? alt : '';
      },
    });

    const body = turndown
      .turndown(document.body.innerHTML)
      .replace(/\n{3,}/gu, '\n\n')
      .trim();
    const markdown =
      title && !body.startsWith(`# ${title}`)
        ? [`# ${title}`, body].filter(Boolean).join('\n\n')
        : body;
    return { markdown, ...(title ? { title } : {}) };
  } finally {
    dom.window.close();
  }
}
