import { Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { WebFetchError } from './web-fetch.error';
import type { NormalizedWebDocument } from './web-fetch.types';
import { codePointLength, sliceCodePoints } from './unicode.utils';

// 识别登录、验证码、订阅或付费墙等无法直接作为公开依据的页面。
const ACCESS_PATTERN =
  /(?:captcha|verify you are human|登录(?:后|以)|登入|订阅后|付费墙|subscribe to continue|sign in to continue|access denied)/iu;
// 识别只返回 JavaScript 壳、需要浏览器执行后才能显示正文的页面。
const JAVASCRIPT_PATTERN =
  /(?:enable javascript|javascript (?:is )?required|请(?:启用|开启)\s*javascript|需要启用\s*javascript)/iu;

@Injectable()
export class DocumentQualityGate {
  // 校验规范化网页是否包含足够、可读且与静态抓取能力匹配的正文。
  validate(document: NormalizedWebDocument): void {
    const readable = this.readableText(document.markdown);
    const length = codePointLength(readable);
    if (length < 120) {
      throw new WebFetchError(AGENT_ERROR_CODES.fetchContentEmpty, '网页中没有足够的可用正文。');
    }
    const sample = `${document.title}\n${sliceCodePoints(readable, 0, 4_000)}`;
    if (length < 1_000 && JAVASCRIPT_PATTERN.test(sample)) {
      throw new WebFetchError(
        AGENT_ERROR_CODES.fetchJsRenderRequired,
        '网页需要执行 JavaScript 后才能读取正文。',
      );
    }
    if (length < 1_000 && ACCESS_PATTERN.test(sample)) {
      throw new WebFetchError(
        AGENT_ERROR_CODES.fetchAccessBlocked,
        '网页需要登录、验证或订阅后才能读取正文。',
      );
    }
    const lines = readable
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean);
    if (lines.length >= 10 && new Set(lines).size / lines.length < 0.2) {
      throw new WebFetchError(
        AGENT_ERROR_CODES.fetchContentExtractionFailed,
        '网页正文主要由重复模板组成，无法可靠提取。',
      );
    }
  }

  // 去掉 Markdown 标记和代码等非正文内容，得到用于质量判断的纯文本样本。
  private readableText(markdown: string): string {
    return markdown
      .replace(/```[\s\S]*?```/gu, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
      .replace(/^[#>*+\-\d.\s|:]+/gmu, '')
      .replace(/[`*_~|]/gu, '')
      .replace(/[ \t]+/gu, ' ')
      .replace(/\n{3,}/gu, '\n\n')
      .trim();
  }
}
