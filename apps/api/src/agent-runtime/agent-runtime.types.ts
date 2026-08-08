import type { ChatMessage } from '@harness/agent-protocol';

export type AgentRuntimeInput = {
  sessionId: string;
  messageId: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

export type AgentRuntimeEvent =
  | { type: 'text.delta'; delta: string }
  | {
      type: 'tool.started';
      toolCallId: string;
      toolName: string;
      input: unknown;
      startedAt: string;
    }
  | {
      type: 'tool.completed';
      toolCallId: string;
      toolName: string;
      input: unknown;
      output: unknown;
      completedAt: string;
      durationMs: number;
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
    }
  | { type: 'run.completed'; content: string; toolCallCount: number };
