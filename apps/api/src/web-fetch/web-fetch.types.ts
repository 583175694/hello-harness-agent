import type { LookupAddress } from 'node:dns';
import type { WebFetchPassage } from '@harness/agent-protocol';

// 抽象 DNS 查询，便于安全规则在测试中使用固定解析结果。
export type WebFetchDnsResolver = (hostname: string) => Promise<LookupAddress[]>;

// URL Guard 校验后返回网络层可使用的规范化目标。
export type GuardedWebUrl = {
  requestedUrl: string;
  normalizedUrl: string;
  url: URL;
};

// Crawlee 获取单个静态资源后返回的受控响应。
export type FetchedWebContent = {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  body: string;
  retrievedAt: string;
};

// HTML 提取器返回的正文和可验证页面元数据。
export type ExtractedWebContent = {
  markdown: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  language?: string;
  canonicalUrl?: string;
};

// 规范化文档中的结构块以 code-point 区间定位。
export type NormalizedDocumentBlock = {
  text: string;
  start: number;
  end: number;
  sectionPath: string[];
  order: number;
};

// 请求内和 LRU 中共用的 canonical Markdown 文档。
export type NormalizedWebDocument = {
  requestedUrl: string;
  finalUrl: string;
  normalizedUrl: string;
  title: string;
  author?: string;
  publishedAt?: string;
  language?: string;
  contentType: string;
  retrievedAt: string;
  contentHash: string;
  truncated: boolean;
  markdown: string;
  blocks: NormalizedDocumentBlock[];
};

// Passage Ranker 内部保留的相关性和稳定排序信息。
export type RankedWebPassage = {
  passage: WebFetchPassage;
  score: number;
  documentIndex: number;
  passageIndex: number;
};

// Fetcher 对单个 URL 的成功或失败结果。
export type WebFetchTransportResult =
  | { status: 'succeeded'; content: FetchedWebContent }
  | { status: 'failed'; requestedUrl: string; code: string; detail: string };
