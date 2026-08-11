// 集中维护跨前后端共享的协议限制，避免表单与接口约束漂移。
export const AGENT_PROTOCOL_LIMITS = {
  // Session 标题和侧栏编辑框允许的最大字符数。
  sessionTitleMaxLength: 28,
  // 单次会话聊天请求允许提交的最大 Markdown 字符数。
  sessionChatContentMaxLength: 100_000,
  // 无状态 Chat 请求允许携带的最大历史消息数。
  chatHistoryMaxMessages: 40,
  // 单次 Agent 运行允许执行的工具调用总数。
  agentToolMaxCalls: 20,
  // 单条 assistant 消息允许持久化的有序内容块总数。
  assistantContentBlocksMax: 64,
  // 单次网页搜索允许提交的查询字符串最大长度。
  searchQueryMaxLength: 500,
  // 单次网页搜索向模型返回的最大结果数。
  searchResultsMax: 10,
  // 单次网页读取允许提交的最大 URL 数量。
  webFetchUrlsMax: 5,
  // 单次网页读取允许提交的证据查询最大长度。
  webFetchQueryMaxLength: 500,
  // 单个网页读取结果允许保存的最大 Passage 数量。
  webFetchPassagesMax: 6,
} as const;

// 集中维护协议中稳定的工具标识。
export const AGENT_TOOL_NAMES = {
  // 网页检索工具在 Function Calling 协议中的稳定名称。
  webSearch: 'web_search',
  // 网页读取工具在 Function Calling 协议中的稳定名称。
  webFetch: 'web_fetch',
} as const;

// 集中维护 API 与 SSE 共用的机器可读错误码。
export const AGENT_ERROR_CODES = {
  // 会话请求体不符合共享协议约束。
  invalidSessionRequest: 'INVALID_SESSION_REQUEST',
  // 请求的会话不存在或不属于当前本地用户。
  sessionNotFound: 'SESSION_NOT_FOUND',
  // 同一会话已有一个正在执行的模型流。
  sessionBusy: 'SESSION_BUSY',
  runNotFound: 'RUN_NOT_FOUND',
  runInterrupted: 'RUN_INTERRUPTED',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
  // 未配置模型供应商 API Key。
  modelNotConfigured: 'MODEL_NOT_CONFIGURED',
  // 模型供应商请求失败。
  modelRequestFailed: 'MODEL_REQUEST_FAILED',
  // SSE 模型流在传输过程中失败。
  modelStreamFailed: 'MODEL_STREAM_FAILED',
  // 模型输出触及供应商的长度限制。
  modelLengthLimit: 'MODEL_LENGTH_LIMIT',
  // 模型返回了空内容，无法交付 assistant 消息。
  modelEmptyResponse: 'MODEL_EMPTY_RESPONSE',
  // 当前 assistant run 已达到模型工具调用次数上限。
  toolCallLimitExceeded: 'TOOL_CALL_LIMIT_EXCEEDED',
  // 工具未在自身声明的外层执行时间内完成。
  toolTimeout: 'TOOL_TIMEOUT',
  // 模型返回的工具参数无法通过工具 Schema 校验。
  invalidToolArguments: 'INVALID_TOOL_ARGUMENTS',
  // 模型请求了未注册的工具名称。
  unknownTool: 'UNKNOWN_TOOL',
  // 工具已注册但当前配置不足以执行。
  toolUnavailable: 'TOOL_UNAVAILABLE',
  // 通用工具调用在执行期间收到取消信号。
  toolCancelled: 'TOOL_CANCELLED',
  // 搜索请求在外部取消信号触发后终止。
  searchCancelled: 'SEARCH_CANCELLED',
  // 搜索 Provider 在规定时间内没有返回。
  searchTimeout: 'SEARCH_TIMEOUT',
  // 搜索 Provider 返回了不可用或错误响应。
  searchProviderFailed: 'SEARCH_PROVIDER_FAILED',
  // 网页读取工具参数不符合批量输入约束。
  fetchInputInvalid: 'FETCH_INPUT_INVALID',
  // 网页读取目标 URL 超过允许长度。
  fetchUrlTooLong: 'FETCH_URL_TOO_LONG',
  // 网页读取目标协议、主机或凭据不被允许。
  fetchUrlNotAllowed: 'FETCH_URL_NOT_ALLOWED',
  // 网页读取目标解析为本机、私网或其他受限地址。
  fetchPrivateAddress: 'FETCH_PRIVATE_ADDRESS',
  // 网页重定向目标不符合安全策略。
  fetchRedirectNotAllowed: 'FETCH_REDIRECT_NOT_ALLOWED',
  // 网页读取未在限定时间内完成。
  fetchTimeout: 'FETCH_TIMEOUT',
  // 网页读取收到调用方取消信号。
  fetchCancelled: 'FETCH_CANCELLED',
  // 网页来源拒绝请求或触发访问频率限制。
  fetchTooManyRequests: 'FETCH_TOO_MANY_REQUESTS',
  // 网页响应体超过允许的字节上限。
  fetchResponseTooLarge: 'FETCH_RESPONSE_TOO_LARGE',
  // 网页响应的 Content-Type 不在静态文本白名单中。
  fetchUnsupportedContentType: 'FETCH_UNSUPPORTED_CONTENT_TYPE',
  // 网页经过清洗后没有可用正文。
  fetchContentEmpty: 'FETCH_CONTENT_EMPTY',
  // 网页主要正文无法被确定性提取。
  fetchContentExtractionFailed: 'FETCH_CONTENT_EXTRACTION_FAILED',
  // 网页返回验证码、登录或付费墙等不可公开读取内容。
  fetchAccessBlocked: 'FETCH_ACCESS_BLOCKED',
  // 网页只有需要浏览器执行 JavaScript 后才能获得的内容壳层。
  fetchJsRenderRequired: 'FETCH_JS_RENDER_REQUIRED',
  // 网页正文有效，但没有与本次 query 相关的原文片段。
  fetchContentNotRelevant: 'FETCH_CONTENT_NOT_RELEVANT',
  // 当前批次已经包含等价 URL，本次重复输入被跳过。
  fetchDuplicateSkipped: 'FETCH_DUPLICATE_SKIPPED',
  // 网页上游返回无法继续处理的错误。
  fetchUpstreamFailed: 'FETCH_UPSTREAM_FAILED',
} as const;

export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[keyof typeof AGENT_ERROR_CODES];
