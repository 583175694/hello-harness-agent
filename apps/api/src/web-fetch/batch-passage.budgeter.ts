import { Injectable } from '@nestjs/common';
import type { RankedWebPassage } from './web-fetch.types';
import { WEB_FETCH_POLICY } from './web-fetch.constants';
import { codePointLength } from './unicode.utils';

@Injectable()
export class BatchPassageBudgeter {
  // 先保留每个来源最高分片段，再按稳定相关性顺序填满整批字符预算。
  select(
    passagesByDocument: RankedWebPassage[][],
    maxCharacters: number = WEB_FETCH_POLICY.maxTotalPassageCharactersPerCall,
  ): Map<number, RankedWebPassage[]> {
    const selected = new Map<number, RankedWebPassage[]>();
    const usedIds = new Set<string>();
    let remaining = Math.min(maxCharacters, WEB_FETCH_POLICY.maxTotalPassageCharactersPerCall);
    const trySelect = (item: RankedWebPassage): void => {
      const length = codePointLength(item.passage.text);
      if (length > remaining || usedIds.has(item.passage.passageId)) return;
      const list = selected.get(item.documentIndex) ?? [];
      list.push(item);
      selected.set(item.documentIndex, list);
      usedIds.add(item.passage.passageId);
      remaining -= length;
    };
    for (const passages of passagesByDocument) if (passages[0]) trySelect(passages[0]);
    const rest = passagesByDocument
      .flat()
      .sort((left, right) =>
        right.score - left.score ||
        left.documentIndex - right.documentIndex ||
        left.passage.locator.position.start - right.passage.locator.position.start,
      );
    for (const passage of rest) trySelect(passage);
    for (const passages of selected.values()) {
      passages.sort((left, right) => left.passage.locator.position.start - right.passage.locator.position.start);
    }
    return selected;
  }
}
