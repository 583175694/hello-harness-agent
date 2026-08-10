# Web Fetch Tool

> 文档状态：Web Fetch V1 已实现。本文定义 canonical `web_fetch` 的现行契约、安全边界、内容处理和验收要求。

## 1. 目标

`web_fetch` 批量获取少量公开 URL，将网页内容转换为有界、可追溯的相关原文片段，并产出 `fetched` Source。

```text
1-5 known URLs
  -> network safety validation
  -> cache lookup
  -> bounded HttpCrawler batch
  -> content-type validation
  -> main-content extraction
  -> sanitization and normalization
  -> query-aware passage selection
  -> untrusted fetched-source payload
```

工具成功只表示已经取得可定位的来源原文，不表示来源内容必然真实、权威、最新或足以支撑最终结论。当前 `used=true` 仅表示最终回答包含该 URL，正式 Evidence/Citation 仍属于后续 Deep Research。

## 2. 模型可见契约

```ts
type WebFetchInput = {
  urls: string[];
  query?: string;
};
```

- `urls` 包含 1-5 个完整 HTTP/HTTPS URL；`WebResearchRunState` 只登记用户当前消息的直链和本轮 `web_search` 结果，未登记 URL 不会发起网络请求。
- `query` 是这一批 URL 共用的证据需求，用于从每份正文中选择相关抽取式原文片段，不用于生成摘要。
- 模型不能指定 Header、Cookie、Authorization、代理、缓存 TTL、超时、响应上限、选择器或安全策略。

工具描述：

```text
批量获取并过滤指定 URL 的公开内容，返回与任务相关的可定位原文片段。
```

## 3. 网络安全

V1 保留与本地 Agent 风险相称的最小网络安全边界：

- 只允许 `http:` 和 `https:`。
- URL 不得包含用户名或密码。
- URL 长度受部署配置限制。
- 拒绝 localhost、loopback、private、link-local、multicast、unspecified 和保留地址。
- 拒绝云平台 metadata endpoint 和内部服务域名。
- DNS 解析结果不能包含私网、保留地址或云平台 metadata 地址。
- 每次重定向重新执行相同的最小 URL、DNS 和 IP 校验，并拒绝 HTTPS 降级到 HTTP。
- 限制 Crawlee 重定向、超时、重试、响应大小、单次 URL 数量和运行级 URL 预算。
- R1 不携带用户 Cookie、Authorization 或自定义敏感 Header。
- TLS 校验默认开启，不提供模型可控的跳过选项。

V1 不实现 prior-context URL allowlist、连接 IP pinning、完整 DNS rebinding 防护和企业级重定向审计；这些作为多用户或服务器部署前的安全加固项。此阶段仍禁止把 API Key、环境变量、内部 prompt 或其他敏感数据编码进 URL。

## 4. 模块边界

V1 在 API 内使用 Crawlee `HttpCrawler` 批量获取静态网页，不依赖外部 Fetch Provider，也不执行页面 JavaScript。实现必须按职责拆分，不把抓取、HTML、缓存和 passage 逻辑堆进 `WebFetchTool`：

```text
WebFetchTool
  -> WebFetchService               用例编排与 canonical result
       -> WebFetchUrlGuard         最小 URL、DNS 和 IP 安全检查
       -> CrawleeWebContentFetcher @crawlee/http 批量抓取与失败收集
       -> WebFetchCache            进程内 LRU
       -> HtmlContentExtractor     JSDOM + Readability 主正文提取
       -> DocumentNormalizer       规范化文本与链接
       -> PassageChunker           结构化切块
       -> PassageRanker            字符 n-gram 相关性排序
```

`CrawleeWebContentFetcher` 使用 `HttpCrawler` 而不是 `CheerioCrawler`：方案不消费 Cheerio `$`，原始 `body` 直接进入 JSDOM，避免无价值的 Cheerio DOM 解析。它不调用 `Dataset.pushData()`、不调用 `enqueueLinks()`，关闭 Crawlee 持久化 Storage，只把本次批量结果收集在请求内存中。

每个模块通过窄接口协作并可独立测试。未来动态网页可以增加基于 `@crawlee/playwright` 的 `BrowserWebContentFetcher`；替换 Fetcher 不改变 Tool、Result、Evidence 或 Workbench 协议。

## 5. 获取限制

内部策略使用集中的代码常量，不进入环境变量或 Function Calling 参数：

```ts
type WebFetchPolicy = {
  maxUrlsPerCall: number;
  maxUrlsPerRun: number;
  maxExternalPassageCharacters: number;
  maxConcurrency: number;
  timeoutMs: number;
  maxRequestRetries: number;
  maxResponseBytes: number;
  maxDocumentCharacters: number;
  maxPassages: number;
  maxPassageCharacters: number;
  cacheTtlMs: number;
  cacheMaxSizeBytes: number;
  allowedContentTypes: readonly string[];
};
```

要求：

- 默认单次最多 5 个 URL、单轮最多接受 25 个唯一初始 URL、最大并发 3、每个 URL 最多重试 1 次、单页处理超时 20 秒。
- 单份文档最多返回 6 个 Passage、单段最多 2,000 Unicode code points，整批 Passage 总量最多 24,000 code points。
- 单轮累计注入的 Fetch Passage 默认最多 60,000 code points；剩余低于 2,000 时不再发起 Fetch。
- 整个 Agent run 不设置 wall-clock 总截止时间。普通模型单轮请求最多 120 秒，强制最终回答单轮请求最多 30 秒；Web Fetch 仍使用独立的 20 秒单操作超时。
- 每个 URL 独立成功或失败；单个 URL 失败不能丢弃同一批次的成功结果。
- 用户取消必须停止当前 Crawlee 运行和尚未开始的请求。
- 响应体和规范化正文都受容量上限控制，不能把完整大页面注入模型。
- 成功、超时、提取失败和网络失败的 URL 都计入运行级 URL 预算。
- 校验错误、明确 4xx 和安全拒绝不重试。

## 6. 内容类型

V1 支持：

```text
text/html
application/xhtml+xml
text/plain
```

V1 拒绝未知二进制、压缩包、可执行文件、图片、音频和视频。PDF、JavaScript Browser Rendering、登录态网页和其他文档格式在后续 capability 中实现，不在 V1 静默降级。

响应头、实际载荷和最终 URL 都需要记录到安全的规范化元数据中。Content-Type 不受支持时返回结构化错误，不把原始字节交给模型。

## 7. 正文提取与过滤

`HttpCrawler` 只获取原始响应，不执行脚本或加载页面子资源。正文处理顺序固定为：

```text
HttpCrawler body
  -> JSDOM standard DOM
  -> deterministic node removal
  -> Mozilla Readability
  -> Turndown + GFM Markdown
  -> normalization
```

V1 使用确定性清理后的规范化 Markdown 作为 Web Fetch canonical document。当前阶段不维护 `DocumentBlock`、Rich Text AST 或 canonical plain text + block 双表示；完整 Markdown 只服务于请求内处理、LRU、Hash、Passage 和 Locator，不作为完整 payload 发送给模型。

具体要求：

- 移除 `script`、`style`、`noscript`、`iframe`、`template` 等不可用节点。
- 主要正文识别交给 Mozilla Readability，不自行维护大量容易误伤正文的 class/id 过滤规则。
- 过滤隐藏内容、不可见控制字符和超长重复文本。
- 移除 Base64 图片数据，保留有意义的 alt 文本。
- 将相对链接转换为基于最终 URL 的绝对链接。
- 保留正文标题层级、段落、列表、表格、代码块和引用块。
- 提取标题、作者、发布时间、语言和 canonical URL；缺失字段不得由模型臆造。
- 对清洗后的正文执行第二次长度限制，并标记是否发生截断。

正文 HTML 通过 Turndown 与 GFM 插件转换成 Markdown；任何 Raw HTML 都不进入模型、Workbench 或持久化数据。`text/plain` 跳过 JSDOM/Readability，直接进入规范化与 passage 管道。

## 8. Passage Selection

清洗后的正文按标题和段落边界切分，不直接把整个文档注入模型上下文。

```text
clean document
  -> structural chunks
  -> character n-gram relevance ranking
  -> top-k extractive passages
  -> total character/token budget
```

规则：

- passage 必须是规范化 Markdown 的连续直接子串，不得由模型总结、改写或跨区间拼接生成。
- `query` 缺失时返回文档开头、关键标题下内容和有限的代表性片段。
- 每个 passage 必须包含稳定 `passageId` 和 locator；`sectionPath` 由扫描 Markdown `#` 至 `######` 标题时维护的当前标题路径生成。
- 相邻命中片段可以确定性合并，但不得改变原文。
- 模型生成的摘要可以作为 observation，不能作为 Evidence passage。
- 相关性不足时返回零 passage 和明确原因，不制造证据。

V1 Ranker 使用字符 n-gram、标题/章节命中加权和简单噪声惩罚，不调用额外模型、Embedding 或 Code Execution。`PassageRanker` 保持独立接口，后续可以替换为 BM25、Embedding rerank 或动态过滤。

## 9. Passage Locator

V1 的 Markdown Passage 定位参考 W3C Web Annotation 的 `TextQuoteSelector` 和 `TextPositionSelector`，同时保存引用文本上下文与规范化 Markdown 区间：

```ts
type WebTextLocator = {
  kind: 'web_text';
  quote: {
    exact: string;
    prefix?: string;
    suffix?: string;
  };
  position: {
    start: number;
    end: number;
  };
  sectionPath?: string[];
};
```

- `exact` 与 passage 完全一致；`prefix/suffix` 用于同文多处匹配时消歧。
- `start` 包含起始字符，`end` 不包含结束字符。
- `quote`、`position` 和 `contentHash` 都基于同一份完整规范化 Markdown；它们不表示 Raw HTML 字节位置或原网页 DOM position。
- 位置基于规范化 Markdown 的 Unicode code points，而不是 JavaScript UTF-16 code units。
- `sectionPath` 保存 passage 所在的标题层级，辅助用户理解和重新定位。
- Locator 必须与 `contentHash`、`retrievedAt` 和最终 URL 一起解释；网页变化后不能用旧位置冒充当前页面位置。
- CSS/XPath 可以作为调试元数据，但不作为正式 Evidence 的唯一定位依据。
- Workbench 可以根据 quote 派生兼容浏览器的 Text Fragment 链接；Text Fragment 只是导航增强，不替代持久化 locator。

## 10. Canonical Result

```ts
type WebFetchResult = {
  query?: string;
  results: WebFetchItemResult[];
  budget: {
    urls: { used: number; limit: number; remaining: number };
    passages: { usedCharacters: number; limitCharacters: number; remainingCharacters: number };
    successfulUniqueDocuments: number;
    networkAttempts: number;
    canFetch: boolean;
    stopReason?: 'url_budget' | 'context_budget' | 'time_budget' | 'no_new_content';
  };
};

type WebFetchItemResult =
  | {
      status: 'succeeded';
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
      cacheStatus: 'hit' | 'miss';
      truncated: boolean;
      passages: Array<{
        passageId: string;
        text: string;
        locator: WebTextLocator;
      }>;
    }
  | {
      status: 'failed';
      requestedUrl: string;
      code: string;
      detail: string;
    }
  | {
      status: 'skipped';
      requestedUrl: string;
      code: string;
      detail: string;
    };
```

`time_budget` 为共享协议兼容枚举保留，当前运行路径不再产生该停止原因。

结果按输入 URL 顺序返回。批量采用部分成功语义：一个 URL 失败或因重复/预算被 `skipped` 不会令其他成功项回滚，也不会被伪装成网络失败。

`contentHash` 基于完整规范化 Markdown 的 UTF-8 内容生成，用于识别内容变化和绑定引用版本。`retrievedAt` 表示该项返回内容所对应的获取时间；缓存命中时不能伪装成当前时间。

`WebFetchResult` 中的成功项属于 `fetched` 材料，失败与跳过项只用于解释调查缺口或资源边界。当前不从它们创建 durable `EvidenceSource` 或 report-scoped `displayId`。

## 11. Cache And Retention

- V1 使用进程内有界 LRU，按固定 TTL 自动失效，不向模型暴露 freshness/cache 参数。
- 缓存同时限制 TTL 和估算字节总量，不能只限制条目数；大页面不会无限占用进程内存。
- 初始默认 TTL 为 15 分钟、正文缓存总量为 32 MiB；数值集中在逐字段注释的常量中，后续按压测和真实页面样本调整。
- Cache 实现按规范化 Markdown 的 UTF-8 字节数计算 size，不以 JavaScript 字符串长度代替内存约束。
- 缓存 key 至少包含规范化 URL、内容处理版本和影响结果的安全配置版本。
- 缓存记录保存获取时间、最终 URL、Content-Type、正文 hash、大小和处理版本。
- TTL 到期后重新 Fetch；V1 不使用 stale fallback，实时获取失败时返回工具错误。
- 涉及敏感 Header、登录态或用户私有数据的内容不进入本阶段缓存，因为 R1 根本不允许这类 Fetch。
- 完整 Raw HTML 只存在于当前 `HttpCrawler` request handler；进程内 LRU 保存完整规范化 Markdown 和受控来源元数据，不保存 Raw HTML、JSDOM、Readability DOM 或其他解析对象。相同 URL 缓存命中后仍按本轮 `query` 重新选择 passages。
- 完整规范化 Markdown 不写入 PostgreSQL、Message metadata、普通 SSE 或 user Memory，也不作为完整工具 payload 发送给模型。
- 返回给模型的有界 passages、来源元数据、locator、hash、retrievedAt 和 cacheStatus 可以保存为 assistant 工具快照，用于刷新后恢复 Workbench；它们的当前资格是 `fetched`。

这一分层对应：

```text
full normalized document
  -> ephemeral LRU cache

bounded fetched passages
  -> assistant tool snapshot / fetched source
```

V1 不为 Fetch Cache 新建数据库表；以后需要跨进程缓存时，只替换 `WebFetchCache` 实现。

## 12. Untrusted Evidence Boundary

Fetch 到的标题、正文、链接、结构化数据和文件内容全部属于不可信证据数据：

- 与 system、user instruction 和 runtime guidance 分区。
- 网页中的角色声明、命令、工具要求和 Prompt Injection 不得执行。
- 外部内容不能改变工具集、预算、安全策略、完成条件或引用规则。
- 网页中的链接只作为不可信候选数据，不自动触发后续 Fetch。
- API Key、环境变量、内部 prompt 和其他 Session 内容不得进入网页请求。

## 13. Error Taxonomy

```text
FETCH_INPUT_INVALID
FETCH_URL_TOO_LONG
FETCH_URL_NOT_ALLOWED
FETCH_PRIVATE_ADDRESS
FETCH_REDIRECT_NOT_ALLOWED
FETCH_TIMEOUT
FETCH_CANCELLED
FETCH_TOO_MANY_REQUESTS
FETCH_RESPONSE_TOO_LARGE
FETCH_UNSUPPORTED_CONTENT_TYPE
FETCH_CONTENT_EMPTY
FETCH_CONTENT_EXTRACTION_FAILED
FETCH_ACCESS_BLOCKED
FETCH_JS_RENDER_REQUIRED
FETCH_CONTENT_NOT_RELEVANT
FETCH_DUPLICATE_SKIPPED
FETCH_UPSTREAM_FAILED
FETCH_BUDGET_EXCEEDED
AGENT_RESEARCH_TIMEOUT
AGENT_EXTERNAL_CONTEXT_BUDGET_EXCEEDED
```

工具错误作为普通 Tool Result 返回给 Runtime，使模型可以在预算内选择其他来源。安全拒绝、原始响应体、内部地址和敏感配置不进入用户消息。

## 14. Projection

Workbench Sources 必须区分：

```text
clue (used=false/true)
  标题、URL、搜索摘要
  不分配 [Sx]

fetched (used=false/true)
  已读取来源、原文 passage、检索时间和定位信息
  used 仅表示最终回答出现该 URL，尚不分配正式 [Sx]
```

完整正文不通过 SSE 推送。SSE 只传递工具生命周期、受控元数据、passage preview 和可按需展开的资源引用。

## 15. V1 验收

1. 模型可以执行 `web_search -> web_fetch(urls: 1-5) -> final answer`。
2. `HttpCrawler` 能并发处理多个 URL，并按输入顺序返回逐项成功或失败结果。
3. localhost、私网和 metadata 地址被最小 URL Guard 拒绝。
4. 超时、取消、响应大小、Content-Type、批量数量和运行级 URL 预算均被强制执行。
5. 静态 HTML 经过 `JSDOM -> Readability -> Turndown` 提取主要正文，Raw HTML 不进入模型上下文。
6. query-aware passages 使用字符 n-gram 筛选，是可定位的抽取式原文而非模型摘要。
7. Locator 同时包含 W3C 风格 quote 和 Unicode code-point position，并绑定正文 hash。
8. 进程内 LRU 有 TTL 和内存上限，过期内容不做 stale fallback。
9. 成功项包含最终 URL、retrievedAt、contentHash、cacheStatus 和截断标志。
10. clue 与 fetched source 在协议和 Workbench 中不可混淆。
11. 网页 Prompt Injection 不改变指令、工具和预算。
12. Crawlee Dataset/Storage 不持久化正文，完整正文不进入普通 SSE、PostgreSQL、Message metadata 或 user Memory。
13. 抓取、缓存、正文提取、规范化、切块和排序可以独立测试和替换。

## 16. V1 暂不实现

- JavaScript Browser Rendering
- PDF 和其他文件格式
- 登录态网页、Cookie 和 Authorization
- 模型自定义 Header、代理或 DOM selector
- Code Execution Dynamic Filtering
- 任意页面 Actions 和浏览器自动化
- 子站点 Crawl
- Crawlee Dataset、Request Queue 持久化和自动 `enqueueLinks`
- 完整 DNS rebinding 防护、连接 IP pinning 和企业级重定向审计
- 自动 PII 识别
- Screenshot、图片理解、音视频提取
- URL prior-context registry
- 跨进程或持久化 Fetch Cache
- robots.txt policy enforcement
- `DocumentBlock`、Rich Text AST 和 Block Renderer
- canonical plain text + block 双表示
- 基于原始 DOM 或 Raw HTML 字节位置的精确 locator

## 17. General Web Research V1 Hardening（已实现）

现有 Web Fetch V1 已在静态正文获取、规范化、字符 n-gram Passage 筛选、Locator 与网络安全边界上完成以下通用 Agent 增强：

- 运行级上限是 25 个唯一 URL 和 60,000 Passage 字符，另有最多 20 次工具调用的通用 Runtime 边界；只维护硬安全上限，信息充分时由模型提前停止。
- Tool observation 返回已用、剩余和是否仍可 Fetch；达到硬上限后请求结束工具阶段并进入一次无工具最终回答，不得连续制造相同预算失败。
- network attempts 与 successful unique documents 分开计数；失败请求仍计入资源预算，重复目标不重复发起网络请求。
- 去重覆盖 input URL、normalized URL、redirect final URL 和正文 contentHash。
- Passage Ranking 前增加 Document Quality Gate，区分验证码/登录或付费墙、JavaScript 空壳、正文提取失败、正文与 query 无关和可用正文。
- 保留 query-aware 字符 2-gram/3-gram Ranker，只做标题/章节权重、模板噪声和重复 Passage 的轻量优化；Embedding、模型 rerank 和 Evidence Card 后置。
- 增加当前前台请求累计 Passage 字符数或粗略 Token 安全阀，为后续推理和最终回答保留空间；旧结果压缩、淘汰、动态加载和精确 Token 编译等待 Context Engineering。
- 连续调用没有新增唯一正文或相关 Passage 时早停，并做轻量来源多样性控制。
- 来源状态区分 Search `clue`、正文读取成功 `fetched` 和最终普通回答的轻量 `used`；snippet 不得伪装成已读取正文。
- 用户直接提供 URL 时允许跳过 Search 调用 Fetch。
- Search 与 Fetch 在可用时保持同时暴露，不用动态工具发现替模型决定顺序；两者通过通用 `ToolRunState` 共享 `WebResearchRunState`，后者在执行 Fetch 前确定性校验 URL 是否来自用户直链或本轮 Search clue。
- 模型、Search 和 Fetch 使用各自独立的单操作超时，并保留端到端用户取消传播；不设置整个前台 Agent 请求的总执行时间预算。
- Workbench 展示 Search、Fetch、成功、失败、重复、预算和最终采用来源；复杂虚拟列表只在真实数据证明需要时实现。

阶段完成后，Web Fetch 应能支撑普通用户的产品比较、时事解释、技术排障、旅行规划、政策解读和直链阅读。后台执行、断线恢复、Worker 独立上下文和大规模 Wide Research 依赖 Durable Run/Delegation；JavaScript Browser Fetch、PDF 和登录态网页属于独立来源能力扩展；正式 EvidenceSource、CitationValidator 和 Report Artifact 属于后续 Deep Research。

### 17.1 Runtime 工具中立化迁移（已实现）

原 `RunResourceLedger` 已移入 Web Research 领域并命名为 `WebResearchRunState`。Runtime 只创建通用 `ToolRunState` 并传给所有工具，Search 与 Fetch 从中取得同一份 Web Research 状态。URL 来源登记、URL/正文去重、URL/Passage 预算、网络尝试和连续无新增内容都由该领域状态维护。

资源停止时，Web Research 只通过统一工具结果返回 `forceFinalAnswer: true` 和通用 `logFields`，不要求 Runtime 识别或禁用 `web_search`、`web_fetch`。此迁移没有改变模型可见输入、SSE、数据库或现有 `WebFetchResult` 协议。

## 18. 参考实现

- [Anthropic Web fetch tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool)
- [Firecrawl Scrape](https://docs.firecrawl.dev/features/scrape)
- [Firecrawl Scrape API](https://docs.firecrawl.dev/api-reference/endpoint/scrape)
- [Tavily Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract)
- [Exa Contents Best Practices](https://exa.ai/docs/reference/contents-best-practices)
- [Mozilla Readability](https://github.com/mozilla/readability)
- [Crawlee HttpCrawler](https://crawlee.dev/js/api/http-crawler/class/HttpCrawler)
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/#selectors)
- [MDN Text Fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments)
- [LlamaIndex Documents and Nodes](https://docs.llamaindex.ai/en/stable/module_guides/loading/documents_and_nodes/usage_nodes/)
