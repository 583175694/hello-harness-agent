import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';

// 当前请求内的确定性运行限制，后续可扩展为配置化策略。
export const DEFAULT_RUNTIME_POLICY = {
  maxToolCalls: AGENT_PROTOCOL_LIMITS.agentToolMaxCalls,
} as const;
