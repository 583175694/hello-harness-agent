import type { ModelMessage, ModelToolCall } from '../model/model-adapter';
import type { AgentToolDefinition } from '../tools/agent-tool.types';

export type CompactionState = {
  summary: string;
  coveredMessageCount: number;
  coveredThroughItemId: string | null;
  version: number;
  tokenCount: number;
};

export type ToolResultCandidate = {
  toolCallId: string;
  toolName: string;
  content: string;
};

export type ContextCompileInput = {
  sessionId: string;
  model: string;
  messages: ModelMessage[];
  tools?: AgentToolDefinition[];
  signal?: AbortSignal;
  compactionState?: CompactionState;
};

export type CompiledContext = {
  messages: ModelMessage[];
  estimatedInputTokens: number;
  promptBudget: number | null;
  compactionTriggered: boolean;
  compactionState?: CompactionState;
};

export type CompactedContext = {
  messages: ModelMessage[];
  estimatedInputTokens: number;
  compactionState: CompactionState;
};

export type ContextToolResult = ToolResultCandidate & {
  originalTokens: number;
  retainedTokens: number;
  truncated: boolean;
  content: string;
};

export type RuntimeToolCall = ModelToolCall;
