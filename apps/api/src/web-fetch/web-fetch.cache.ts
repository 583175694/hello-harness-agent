import { Injectable } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import type { NormalizedWebDocument } from './web-fetch.types';
import { WEB_FETCH_POLICY } from './web-fetch.constants';

@Injectable()
export class WebFetchCache {
  private readonly entries = new LRUCache<string, NormalizedWebDocument>({
    maxSize: WEB_FETCH_POLICY.cacheMaxSizeBytes,
    ttl: WEB_FETCH_POLICY.cacheTtlMs,
    allowStale: false,
    sizeCalculation: (document) => Buffer.byteLength(document.markdown, 'utf8'),
  });

  // 根据规范化 URL 和处理策略版本生成稳定缓存键。
  key(normalizedUrl: string): string {
    return [
      normalizedUrl,
      WEB_FETCH_POLICY.processingVersion,
      WEB_FETCH_POLICY.securityVersion,
    ].join('|');
  }

  // 读取未过期的 canonical 文档，不返回 stale 内容。
  get(normalizedUrl: string): NormalizedWebDocument | undefined {
    return this.entries.get(this.key(normalizedUrl));
  }

  // 缓存规范化 Markdown 和受控元数据，不保存 Raw HTML 或 DOM。
  set(cacheUrl: string, document: NormalizedWebDocument): void {
    this.entries.set(this.key(cacheUrl), document);
  }
}
