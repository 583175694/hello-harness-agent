import { Module } from '@nestjs/common';
import { BatchPassageBudgeter } from './batch-passage.budgeter';
import { CrawleeWebContentFetcher } from './crawlee-web-content.fetcher';
import { DocumentNormalizer } from './document.normalizer';
import { DocumentQualityGate } from './document-quality.gate';
import { HtmlContentExtractor } from './html-content.extractor';
import { PassageChunker } from './passage.chunker';
import { PassageRanker } from './passage.ranker';
import { WebFetchCache } from './web-fetch.cache';
import { WEB_FETCH_DNS_RESOLVER } from './web-fetch.constants';
import { WebFetchService } from './web-fetch.service';
import { systemWebFetchDnsResolver, WebFetchUrlGuard } from './web-fetch-url.guard';

@Module({
  providers: [
    // 默认使用系统 DNS，测试可通过相同 Token 注入固定解析器。
    { provide: WEB_FETCH_DNS_RESOLVER, useValue: systemWebFetchDnsResolver },
    WebFetchUrlGuard,
    CrawleeWebContentFetcher,
    WebFetchCache,
    HtmlContentExtractor,
    DocumentNormalizer,
    DocumentQualityGate,
    PassageChunker,
    PassageRanker,
    BatchPassageBudgeter,
    WebFetchService,
  ],
  exports: [WebFetchService],
})
export class WebFetchModule {}
