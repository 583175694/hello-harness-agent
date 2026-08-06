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
  // 单次网页搜索允许提交的查询字符串最大长度。
  searchQueryMaxLength: 500,
  // 单次网页搜索向模型返回的最大结果数。
  searchResultsMax: 10,
} as const;

// 集中维护协议中稳定的工具标识。
export const AGENT_TOOL_NAMES = {
  // 网页检索工具在 Function Calling 协议中的稳定名称。
  webSearch: 'web_search',
} as const;

// 集中维护 API 与 SSE 共用的机器可读错误码。
export const AGENT_ERROR_CODES = {
  // 会话请求体不符合共享协议约束。
  invalidSessionRequest: 'INVALID_SESSION_REQUEST',
  // 请求的会话不存在或不属于当前本地用户。
  sessionNotFound: 'SESSION_NOT_FOUND',
  // 同一会话已有一个正在执行的模型流。
  sessionBusy: 'SESSION_BUSY',
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
  // Agent 已达到本轮工具调用预算。
  toolBudgetExceeded: 'TOOL_BUDGET_EXCEEDED',
  // 模型返回的工具参数无法通过工具 Schema 校验。
  invalidToolArguments: 'INVALID_TOOL_ARGUMENTS',
  // 模型请求了未注册的工具名称。
  unknownTool: 'UNKNOWN_TOOL',
  // 工具已注册但当前配置不足以执行。
  toolUnavailable: 'TOOL_UNAVAILABLE',
  // 搜索请求在外部取消信号触发后终止。
  searchCancelled: 'SEARCH_CANCELLED',
  // 搜索 Provider 在规定时间内没有返回。
  searchTimeout: 'SEARCH_TIMEOUT',
  // 搜索 Provider 返回了不可用或错误响应。
  searchProviderFailed: 'SEARCH_PROVIDER_FAILED',
} as const;

export type AgentErrorCode = typeof AGENT_ERROR_CODES[keyof typeof AGENT_ERROR_CODES];
