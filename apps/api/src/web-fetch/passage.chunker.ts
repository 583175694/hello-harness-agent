import { Injectable } from '@nestjs/common';
import type { NormalizedDocumentBlock, NormalizedWebDocument } from './web-fetch.types';
import { WEB_FETCH_POLICY } from './web-fetch.constants';
import { codePointLength, sliceCodePoints } from './unicode.utils';

@Injectable()
export class PassageChunker {
  // 沿结构块和句子边界切分正文，保证每个候选都是 canonical Markdown 连续子串。
  chunk(document: NormalizedWebDocument): NormalizedDocumentBlock[] {
    return document.blocks.flatMap((block) => this.splitBlock(block));
  }

  // 将超长结构块优先按句末切分，无法命中时按 code point 硬切。
  private splitBlock(block: NormalizedDocumentBlock): NormalizedDocumentBlock[] {
    if (codePointLength(block.text) <= WEB_FETCH_POLICY.maxPassageCharacters) return [block];
    const output: NormalizedDocumentBlock[] = [];
    const points = Array.from(block.text);
    let localStart = 0;
    while (localStart < points.length) {
      let localEnd = Math.min(localStart + WEB_FETCH_POLICY.maxPassageCharacters, points.length);
      if (localEnd < points.length) {
        const candidate = points.slice(localStart, localEnd).join('');
        const boundary = Math.max(
          candidate.lastIndexOf('。'),
          candidate.lastIndexOf('！'),
          candidate.lastIndexOf('？'),
          candidate.lastIndexOf('. '),
          candidate.lastIndexOf('\n'),
        );
        if (boundary >= Math.floor(WEB_FETCH_POLICY.maxPassageCharacters * 0.5)) {
          localEnd = localStart + codePointLength(candidate.slice(0, boundary + 1));
        }
      }
      const text = sliceCodePoints(block.text, localStart, localEnd).trim();
      if (text) {
        const leading = codePointLength(
          sliceCodePoints(block.text, localStart, localEnd).slice(
            0,
            sliceCodePoints(block.text, localStart, localEnd).indexOf(text),
          ),
        );
        const start = block.start + localStart + leading;
        output.push({
          text,
          start,
          end: start + codePointLength(text),
          sectionPath: [...block.sectionPath],
          order: block.order + output.length / 100,
        });
      }
      localStart = Math.max(localEnd, localStart + 1);
    }
    return output;
  }
}
