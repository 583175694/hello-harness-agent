import { Injectable } from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { WebFetchError } from './web-fetch.error';
import type { ExtractedWebContent } from './web-fetch.types';

@Injectable()
export class HtmlContentExtractor {
  // 将静态 HTML 提取为保留正文结构的 Markdown 和可验证元数据。
  extract(html: string, finalUrl: string): ExtractedWebContent {
    try {
      const dom = new JSDOM(html, { url: finalUrl, runScripts: 'outside-only' });
      const document = dom.window.document;
      const publishedAt = this.readPublishedAt(document);
      const canonicalUrl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
      const language = document.documentElement.lang.trim() || undefined;
      this.removeUnavailableNodes(document);
      this.absolutizeLinks(document, finalUrl);
      const article = new Readability(document.cloneNode(true) as Document).parse();
      if (!article?.content?.trim()) {
        throw new WebFetchError(
          AGENT_ERROR_CODES.fetchContentExtractionFailed,
          '网页主要正文无法提取。',
        );
      }
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
      return {
        markdown: turndown.turndown(article.content),
        ...(article.title?.trim() ? { title: article.title.trim() } : {}),
        ...(article.byline?.trim() ? { author: article.byline.trim() } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        ...(language ? { language } : {}),
        ...(canonicalUrl ? { canonicalUrl } : {}),
      };
    } catch (error) {
      if (error instanceof WebFetchError) throw error;
      throw new WebFetchError(
        AGENT_ERROR_CODES.fetchContentExtractionFailed,
        '网页主要正文无法提取。',
      );
    }
  }

  // 删除脚本、嵌入资源、表单和隐藏节点，避免无用内容进入 Readability。
  private removeUnavailableNodes(document: Document): void {
    for (const node of document.querySelectorAll(
      'script,style,noscript,iframe,template,form,svg,[hidden],[aria-hidden="true"]',
    )) node.remove();
    for (const node of document.querySelectorAll<HTMLElement>('[style]')) {
      const style = node.getAttribute('style')?.toLowerCase() ?? '';
      if (style.includes('display:none') || style.includes('visibility:hidden')) node.remove();
    }
  }

  // 把正文中的相对链接转换为绝对地址并移除 data 协议资源。
  private absolutizeLinks(document: Document, finalUrl: string): void {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('data:')) link.removeAttribute('href');
      else {
        try { link.href = new URL(href, finalUrl).toString(); } catch { link.removeAttribute('href'); }
      }
    }
    for (const image of document.querySelectorAll<HTMLImageElement>('img')) {
      if ((image.getAttribute('src') ?? '').startsWith('data:')) image.removeAttribute('src');
    }
  }

  // 从常见机器可读字段提取页面发布时间，不解析自然语言正文。
  private readPublishedAt(document: Document): string | undefined {
    const value =
      document.querySelector<HTMLMetaElement>('meta[property="article:published_time"]')?.content ??
      document.querySelector<HTMLMetaElement>('meta[name="date"]')?.content ??
      document.querySelector<HTMLTimeElement>('time[datetime]')?.dateTime;
    return value?.trim() || undefined;
  }
}
