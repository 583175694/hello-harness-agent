import type { RunStreamEvent } from '@harness/agent-protocol';

type RunPayload = RunStreamEvent['payload'];

export type ToolStreamEvent = Extract<
  RunPayload,
  { type: 'tool.started' | 'tool.completed' | 'tool.failed' | 'tool.cancelled' }
>;
export type MessageDeltaEvent = Extract<RunPayload, { type: 'message.delta' }>;
export type MessagePhaseCompletedEvent = Extract<RunPayload, { type: 'message.phase.completed' }>;
export type MessageDiscardedEvent = Extract<RunPayload, { type: 'message.discarded' }>;
export type ReasoningDeltaEvent = Extract<RunPayload, { type: 'reasoning.delta' }>;
export type ModelRoundCompletedEvent = Extract<RunPayload, { type: 'model.round.completed' }>;

export type ApiClientConfig = {
  baseUrl: string;
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
  getAuthHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
};

export type ClientContext = {
  baseUrl: string;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  parseResponse: (response: Response) => Promise<unknown>;
};
