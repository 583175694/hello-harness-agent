import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';

// 当前请求内的确定性运行限制。
export const DEFAULT_RUNTIME_POLICY = {
  // 单次普通模型轮次允许等待的最长时间，不限制整个 Agent 运行时长。
  modelRoundTimeoutMs: 120_000,
  // 所有工具共享的模型调用次数上限。
  maxToolCalls: AGENT_PROTOCOL_LIMITS.agentToolMaxCalls,
  // 调查阶段结束后，无工具最终回答可使用的最长时间。
  finalAnswerTimeoutMs: 30_000,
  // 最终回答出现供应商协议污染后允许重试的次数。
  finalAnswerProtocolRetries: 1,
} as const;
