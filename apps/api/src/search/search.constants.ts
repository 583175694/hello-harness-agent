import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';

// 集中维护搜索供应商和文本归一化的稳定限制。
export const SEARCH_LIMITS = {
  // 搜索工具允许提交的查询字符串最大长度。
  queryMaxLength: AGENT_PROTOCOL_LIMITS.searchQueryMaxLength,
  // Provider 请求和协议返回的最大结果数。
  resultsMax: AGENT_PROTOCOL_LIMITS.searchResultsMax,
  // 进入模型上下文的网页标题最大长度。
  titleMaxLength: 240,
  // 进入模型上下文的网页摘要最大长度。
  snippetMaxLength: 800,
  // 来源发布时间字段的最大长度。
  publishedAtMaxLength: 80,
  // 来源站点名称字段的最大长度。
  sourceMaxLength: 160,
  // 结果 URL 哈希写入稳定结果 ID 时保留的长度。
  resultIdHashLength: 16,
} as const;
