import type {
  ModelRoundObservation,
  ReasoningEffort,
  RunContextDebug,
} from '@harness/agent-protocol';
import type { ModelMessage } from '../model/model-adapter';
import type { CompactionState } from '../context-engineering/context-engineering.types';
import type { RuntimeLifecycleController } from './runtime-lifecycle';

export type AgentRuntimeInput = {
  sessionId: string;
  runId?: string;
  messageId: string;
  model: string;
  systemPrompt: string;
  messages: ModelMessage[];
  reasoningEffort?: ReasoningEffort;
  signal?: AbortSignal;
  lifecycle?: RuntimeLifecycleController;
};

// Runtime 事件只描述 Agent 语义和稳定业务位置，不携带 Run eventSequence；
// eventSequence 由 RunEventHub 在 Projection 已准备好后统一分配。
export type AgentRuntimeEvent =
  | {
      type: 'model.round.completed';
      observation: ModelRoundObservation;
      context?: RunContextDebug;
    }
  | {
      type: 'text.delta';
      delta: string;
      roundId: string;
      roundSequence: number;
      blockSequence: number;
    }
  | {
      type: 'tool.started';
      toolCallId: string;
      toolName: string;
      input: unknown;
      startedAt: string;
      roundId: string;
      roundSequence: number;
      blockSequence: number;
    }
  | {
      type: 'tool.completed';
      toolCallId: string;
      toolName: string;
      input: unknown;
      output: unknown;
      completedAt: string;
      durationMs: number;
      roundId: string;
      roundSequence: number;
      blockSequence: number;
    }
  | {
      type: 'tool.failed';
      toolCallId: string;
      toolName: string;
      input: unknown;
      completedAt: string;
      durationMs: number;
      code: string;
      detail: string;
      retryable: boolean;
      roundId: string;
      roundSequence: number;
      blockSequence: number;
    }
  | {
      type: 'tool.cancelled';
      toolCallId: string;
      toolName: string;
      input: unknown;
      completedAt: string;
      durationMs: number;
      code: string;
      detail: string;
      roundId: string;
      roundSequence: number;
      blockSequence: number;
    }
  | { type: 'transcript.item'; message: ModelMessage }
  | {
      type: 'run.completed';
      content: string;
      toolCallCount: number;
      compactionState?: CompactionState;
    };
