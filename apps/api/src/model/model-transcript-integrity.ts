import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ModelMessage } from './model-adapter';

export class ModelTranscriptIntegrityError extends Error {
  constructor(
    message: string,
    readonly detail?: { callId?: string; messageIndex?: number; itemIndex?: number },
  ) {
    super(message);
    this.name = 'ModelTranscriptIntegrityError';
  }
}

export function shouldReplayAssistantReasoning(
  replayReasoningWithTools: boolean,
  message: { reasoning?: string; toolCalls?: unknown[] },
): boolean {
  if (!message.reasoning) return false;
  if (replayReasoningWithTools) return true;
  return Boolean(message.toolCalls?.length);
}

/** 校验 canonical 消息：tool 结果必须紧跟带 toolCalls 的 assistant 轮，且 call_id 已声明。 */
export function assertCanonicalToolTranscript(messages: ModelMessage[]): void {
  let pendingCallIds: Set<string> | null = null;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (message.role === 'assistant') {
      pendingCallIds = message.toolCalls?.length
        ? new Set(message.toolCalls.map((call) => call.id))
        : null;
      continue;
    }
    if (message.role === 'user' || message.role === 'system') {
      pendingCallIds = null;
      continue;
    }
    if (message.role === 'tool') {
      if (!pendingCallIds?.has(message.toolCallId)) {
        throw new ModelTranscriptIntegrityError(
          `Tool result without matching assistant tool call (call_id=${message.toolCallId})`,
          { callId: message.toolCallId, messageIndex: index },
        );
      }
      pendingCallIds.delete(message.toolCallId);
      if (pendingCallIds.size === 0) pendingCallIds = null;
    }
  }
}

/** 校验 Responses API input：每个 function_call_output 之前必须已有同 call_id 的 function_call。 */
export function assertResponsesInputToolChain(items: Record<string, unknown>[]): void {
  const seenCallIds = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const type = String(item.type ?? '');
    if (type === 'function_call') {
      const callId = String(item.call_id ?? '');
      if (callId) seenCallIds.add(callId);
      continue;
    }
    if (type === 'function_call_output') {
      const callId = String(item.call_id ?? '');
      if (!callId || !seenCallIds.has(callId)) {
        throw new ModelTranscriptIntegrityError(
          `function_call_output without preceding function_call (call_id=${callId || 'empty'})`,
          { callId: callId || undefined, itemIndex: index },
        );
      }
    }
  }
}

/** 校验 Chat Completions 消息：tool 消息的 tool_call_id 必须来自前面某条 assistant.tool_calls。 */
export function assertChatCompletionToolChain(messages: ChatCompletionMessageParam[]): void {
  const declaredCallIds = new Set<string>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (message.role === 'assistant' && 'tool_calls' in message && message.tool_calls?.length) {
      for (const call of message.tool_calls) {
        if (call.type === 'function' && call.id) declaredCallIds.add(call.id);
      }
      continue;
    }
    if (message.role === 'tool') {
      const callId = message.tool_call_id;
      if (!declaredCallIds.has(callId)) {
        throw new ModelTranscriptIntegrityError(
          `tool message without matching assistant tool_calls (tool_call_id=${callId})`,
          { callId, messageIndex: index },
        );
      }
    }
  }
}

/** 供日志使用的 anonymized Responses input 摘要（不含正文与参数）。 */
export function summarizeResponsesInputForLog(items: Record<string, unknown>[]): string {
  return items
    .map((item, index) => {
      const type = String(item.type ?? 'unknown');
      if (type === 'function_call' || type === 'function_call_output') {
        return `${index}:${type}:${String(item.call_id ?? '')}`;
      }
      if (type === 'reasoning') return `${index}:reasoning`;
      if (type === 'message') return `${index}:message:${String(item.role ?? '')}`;
      return `${index}:${type}`;
    })
    .join(' | ');
}
