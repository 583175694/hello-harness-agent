import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';

// 当前请求内的确定性运行限制。
export const DEFAULT_RUNTIME_POLICY = {
  // 单次普通模型轮次允许等待的最长时间，不限制整个 Agent 运行时长。
  modelRoundTimeoutMs: 120_000,
  // 一个 Run 的累计执行时限；暂停和等待用户输入仍由生命周期控制，不延长该硬边界。
  runTimeoutMs: 10 * 60_000,
  // 所有工具共享的模型调用次数上限。
  maxToolCalls: AGENT_PROTOCOL_LIMITS.agentToolMaxCalls,
  // 调查阶段结束后，无工具最终回答可使用的最长时间。
  finalAnswerTimeoutMs: 60_000,
  // 普通工具决策轮与最终回答轮使用独立输出预算，避免把模型能力上限当作默认请求预算。
  toolRoundMaxOutputTokens: 8_192,
  finalAnswerMaxOutputTokens: 16_384,
  // 最终回答出现供应商协议污染后允许重试的次数。
  finalAnswerProtocolRetries: 1,
} as const;
