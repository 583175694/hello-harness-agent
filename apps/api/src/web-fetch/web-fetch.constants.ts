// 集中维护 Web Fetch V1 的确定性资源和安全边界。
export const WEB_FETCH_POLICY = {
  // 单个 URL 允许的最大字符数。
  maxUrlLength: 2_048,
  // 单次工具调用允许读取的最大 URL 数量。
  maxUrlsPerCall: 5,
  // 单次 Agent 运行允许读取的最大 URL 数量。
  maxUrlsPerRun: 10,
  // 同一批次允许并行进行的最大网络请求数。
  maxConcurrency: 3,
  // 单个 URL 从导航到内容处理的超时时间。
  timeoutMs: 20_000,
  // 可恢复网络错误允许的最大重试次数。
  maxRequestRetries: 1,
  // 单个 URL 允许跟随的最大重定向次数。
  maxRedirects: 5,
  // 单个解压后响应体允许读取的最大 UTF-8 字节数。
  maxResponseBytes: 5 * 1024 * 1024,
  // 单份规范化 Markdown 允许保留的最大 Unicode code point 数。
  maxDocumentCharacters: 200_000,
  // 单份网页最多向模型返回的原文 Passage 数量。
  maxPassagesPerDocument: 6,
  // 单个 Passage 允许包含的最大 Unicode code point 数。
  maxPassageCharacters: 2_000,
  // 单次批量调用向模型返回的 Passage 总字符预算。
  maxTotalPassageCharactersPerCall: 24_000,
  // Locator 前后文各自允许保留的最大字符数。
  locatorContextCharacters: 32,
  // 规范化正文在进程内缓存的固定存活时间。
  cacheTtlMs: 15 * 60 * 1_000,
  // 进程内正文缓存允许占用的最大 UTF-8 字节数。
  cacheMaxSizeBytes: 32 * 1024 * 1024,
  // Web Fetch V1 接受的公开文本响应类型。
  allowedContentTypes: ['text/html', 'application/xhtml+xml', 'text/plain'] as const,
  // 字符 n-gram Passage 排序允许返回结果的最低相关性。
  minimumRelevanceScore: 0.04,
  // 缓存失效时区分正文处理算法的版本。
  processingVersion: 'markdown-v1',
  // 缓存失效时区分网络安全策略的版本。
  securityVersion: 'url-guard-v1',
} as const;

// Crawlee 使用的请求标签，避免内部 request.userData 出现散落字符串。
export const WEB_FETCH_REQUEST_LABEL = 'WEB_FETCH' as const;

// 注入可替换 DNS Resolver 时使用的 Nest 标识。
export const WEB_FETCH_DNS_RESOLVER = Symbol('WEB_FETCH_DNS_RESOLVER');
