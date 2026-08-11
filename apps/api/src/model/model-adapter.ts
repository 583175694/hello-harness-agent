import type { AgentToolDefinition } from '../tools/agent-tool.types';

export type ModelToolCall = { id: string; name: string; arguments: string };

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
  | { type: 'text.delta'; delta: string }
  | { type: 'tool_calls.completed'; calls: ModelToolCall[] }
  | { type: 'round.completed'; finishReason: string | null };

// 隔离具体模型供应商协议，Runtime 只消费标准化轮次事件。
export abstract class ModelAdapter {
  abstract streamRound(input: ModelRoundInput): AsyncIterable<ModelRoundEvent>;
  abstract generateText(model: string, messages: ModelMessage[]): Promise<string>;
}
