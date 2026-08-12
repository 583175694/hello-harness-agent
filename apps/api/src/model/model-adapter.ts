import type { AgentToolDefinition } from '../tools/agent-tool.types';

export type ModelToolCall = {
  id: string;
  name: string;
  arguments: string;
  blockSequence: number;
  providerIndex: number;
};

// Runtime 和模型适配器之间使用的供应商无关消息协议。
export type ModelMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ModelToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string };

export type ModelRoundInput = {
  model: string;
  messages: ModelMessage[];
  tools?: AgentToolDefinition[];
  signal?: AbortSignal;
};

export type ModelRoundEvent =
  // blockSequence 是供应商无关的统一展示位置；Runtime 不使用 chunk 到达顺序排序。
  | { type: 'text.delta'; delta: string; blockSequence: number }
  // Tool Call 参数在 Adapter 内聚合完整后一次性交给 Runtime，避免执行半截 JSON。
  | { type: 'tool_calls.completed'; calls: ModelToolCall[] }
  // Round 结束后 Runtime 才能根据是否存在 Tool Call 判断 Content 的最终语义。
  | { type: 'round.completed'; finishReason: string | null };

// 隔离具体模型供应商协议，Runtime 只消费标准化轮次事件。
export abstract class ModelAdapter {
  abstract streamRound(input: ModelRoundInput): AsyncIterable<ModelRoundEvent>;
  abstract generateText(model: string, messages: ModelMessage[]): Promise<string>;
}
