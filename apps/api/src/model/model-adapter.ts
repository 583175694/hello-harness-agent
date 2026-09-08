import type { AgentToolDefinition } from '../tools/agent-tool.types';
import type { ClarificationRequest } from '@harness/agent-protocol';
import type { ReasoningCapability, ReasoningEffort } from '@harness/agent-protocol';

export type UserContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_ref'; fileId: string; detail?: 'auto' }
  // 文件正文不进入消息；模型需内容时通过 search_file/read_file_lines 获取。
  | {
      type: 'file_ref';
      fileId: string;
      fileName: string;
      mediaType?: string;
      size?: number;
      lineCount?: number;
      pageCount?: number;
      // 旧 B.1 消息的兼容字段；新链路不生成正文。
      content?: string;
    };

export type ModelToolCall = {
  id: string;
  name: string;
  arguments: string;
  blockSequence: number;
  providerIndex: number;
};

// Runtime 和模型适配器之间使用的供应商无关消息协议。
export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | UserContentBlock[] }
  | {
      role: 'assistant';
      content: string | null;
      reasoning?: string;
      toolCalls?: ModelToolCall[];
    }
  | {
      role: 'tool';
      content: string;
      toolCallId: string;
      controlOutcome?: 'approved_by_user' | 'rejected_by_user' | 'rejected_by_policy';
    };

export type ModelRoundInput = {
  model: string;
  messages: ModelMessage[];
  tools?: AgentToolDefinition[];
  reasoningEffort: ReasoningEffort;
  signal?: AbortSignal;
  allowClarification?: boolean;
};

export type ModelRoundEvent =
  // blockSequence 是供应商无关的统一展示位置；Runtime 不使用 chunk 到达顺序排序。
  | { type: 'text.delta'; delta: string; blockSequence: number }
  | { type: 'reasoning.delta'; delta: string; blockSequence: number }
  // Tool Call 参数在 Adapter 内聚合完整后一次性交给 Runtime，避免执行半截 JSON。
  | { type: 'tool_calls.completed'; calls: ModelToolCall[] }
  | { type: 'clarification.completed'; request: ClarificationRequest }
  // Round 结束后 Runtime 才能根据是否存在 Tool Call 判断 Content 的最终语义。
  | {
      type: 'round.completed';
      finishReason: string | null;
      usage: {
        promptTokens: number | null;
        completionTokens: number | null;
        cachedTokens: number | null;
        estimatedPromptTokens: number;
      };
    };

// 隔离具体模型供应商协议，Runtime 只消费标准化轮次事件。
export abstract class ModelAdapter {
  // 返回模型能力，供运行时校验推理和视觉请求。
  abstract profile(model: string): {
    provider: string;
    reasoningFormat?: string;
    reasoning: ReasoningCapability;
    supportsVision?: boolean;
  };
  // 流式执行一轮模型请求，并输出供应商无关事件。
  abstract streamRound(input: ModelRoundInput): AsyncIterable<ModelRoundEvent>;
  // 执行一次非流式文本请求，供标题和摘要等内部任务使用。
  abstract generateText(
    model: string,
    messages: ModelMessage[],
    signal?: AbortSignal,
  ): Promise<string>;
}
