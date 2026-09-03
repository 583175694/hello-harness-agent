import type {
  ClarificationRequest,
  ModelRoundObservation,
  ReasoningEffort,
  RunContextDebug,
} from '@harness/agent-protocol';
import type { PlanSnapshot } from '@harness/agent-protocol';
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
  onBeforeModelRequest?: (
    roundSequence: number,
    finalResponseOnly: boolean,
  ) => Promise<{
    messages: ModelMessage[];
    interventions?: Array<{ inputId: string; content: string }>;
  }>;
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
      type: 'clarification.requested';
      request: import('@harness/agent-protocol').ClarificationRequest;
      roundId: string;
      roundSequence: number;
    }
  | {
      type: 'text.delta';
      delta: string;
      roundId: string;
      roundSequence: number;
      blockSequence: number;
    }
  | {
      type: 'user.intervention';
      inputId: string;
      content: string;
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
      type: 'plan.updated';
      explanation?: string;
      plan: PlanSnapshot['plan'];
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
      type: 'transcript.fact';
      fact:
        | {
            kind: 'clarification_request';
            interruptId: string;
            roundId: string;
            roundSequence: number;
            request: ClarificationRequest;
          }
        | {
            kind: 'clarification_response';
            interruptId: string;
            roundId: string;
            roundSequence: number;
            answer: string;
          };
    }
  | {
      type: 'run.completed';
      content: string;
      toolCallCount: number;
      compactionState?: CompactionState;
    };
