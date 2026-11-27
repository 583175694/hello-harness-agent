// 集中维护 Web Fetch V1 的确定性资源和安全边界。
export const WEB_FETCH_POLICY = {
  // 整批网页读取 Tool Call 允许占用的最长时间。
  toolTimeoutMs: 45_000,
  // 单个 URL 允许的最大字符数。
  maxUrlLength: 2_048,
  // 同一批次允许并行进行的最大网络请求数。
  maxConcurrency: 3,
  // 单个 URL 从导航到内容处理的超时时间。
  transportTimeoutMs: 10_000,
  // 可恢复网络错误允许的最大重试次数。
  maxRequestRetries: 1,
  // 单个 URL 允许跟随的最大重定向次数。
  maxRedirects: 5,
  // 单个解压后响应体允许读取的最大 UTF-8 字节数。
  maxResponseBytes: 5 * 1024 * 1024,
  // 单个 PDF 响应体允许读取的最大字节数。
  maxPdfResponseBytes: 10 * 1024 * 1024,
  // 单个在线 PDF 允许提取的最大页数，超出后按页截断并标记 truncated。
  maxPdfPages: 60,
  // 单个在线 PDF 解析允许占用的最长时间。
  pdfParseTimeoutMs: 15_000,
  // 送入 HTML 抽取的最大 UTF-8 字节数，避免 JSDOM/Readability 在巨型页面上长时间阻塞。
  maxHtmlExtractBytes: 1024 * 1024,
  // 单份规范化 Markdown 允许保留的最大 Unicode code point 数。
  maxDocumentCharacters: 200_000,
  // 单个 Passage 允许包含的最大 Unicode code point 数。
  maxPassageCharacters: 2_000,
  // 单次批量调用向模型返回的 Passage 总字符预算。
  maxTotalPassageCharactersPerCall: 24_000,
  // 跨语种 query 未命中关键词时降级返回的最大代表性片段数。
  fallbackExcerptMaxPassages: 3,
  // 降级代表性片段的排序分，严格低于 minimumRelevanceScore，避免挤占命中文档预算。
  fallbackExcerptScore: 0.001,
  // Locator 前后文各自允许保留的最大字符数。
  locatorContextCharacters: 32,
  // 规范化正文在进程内缓存的固定存活时间。
  cacheTtlMs: 15 * 60 * 1_000,
  // 进程内正文缓存允许占用的最大 UTF-8 字节数。
  cacheMaxSizeBytes: 32 * 1024 * 1024,
  // 外发抓取请求使用的 User-Agent。
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Web Fetch 接受的公开文本与 PDF 响应类型。
  allowedContentTypes: [
    'text/html',
    'application/xhtml+xml',
    'text/plain',
    'application/json',
    'application/pdf',
  ] as const,
  // 字符 n-gram Passage 排序允许返回结果的最低相关性。
  minimumRelevanceScore: 0.04,
  // 缓存失效时区分正文处理算法的版本。
  processingVersion: 'markdown-v3',
  // 缓存失效时区分网络安全策略的版本。
  securityVersion: 'url-guard-v1',
} as const;

// 注入可替换 DNS Resolver 时使用的 Nest 标识。
export const WEB_FETCH_DNS_RESOLVER = Symbol('WEB_FETCH_DNS_RESOLVER');
