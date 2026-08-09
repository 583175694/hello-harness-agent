import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';

// 当前请求内的确定性运行限制。
export const DEFAULT_RUNTIME_POLICY = {
  // 单轮 Agent 最多接受的唯一初始 URL 数量。
  maxWebFetchUrlsPerRun: 25,
  // 模型调查轮次与联网工具共享的最长时间。
  researchTimeoutMs: 120_000,
  // 单轮允许累计注入模型的 Fetch Passage 字符数。
  maxExternalPassageCharacters: 60_000,
  // 所有工具共享的模型调用次数上限。
  maxToolCalls: AGENT_PROTOCOL_LIMITS.agentToolMaxCalls,
  // 调查阶段结束后，无工具最终回答可使用的最长时间。
  finalAnswerTimeoutMs: 30_000,
} as const;
