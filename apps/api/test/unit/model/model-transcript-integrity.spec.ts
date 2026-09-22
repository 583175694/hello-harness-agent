import { describe, expect, it } from 'vitest';
import {
  assertCanonicalToolTranscript,
  assertResponsesInputToolChain,
  shouldReplayAssistantReasoning,
} from '../../../src/model/model-transcript-integrity';
import { ModelTranscriptIntegrityError } from '../../../src/model/model-transcript-integrity';

describe('model-transcript-integrity', () => {
  it('replays all assistant reasoning when tools are present in the request', () => {
    expect(
      shouldReplayAssistantReasoning(true, {
        reasoning: '最终轮推理',
        toolCalls: undefined,
      }),
    ).toBe(true);
    expect(
      shouldReplayAssistantReasoning(true, {
        reasoning: '工具轮推理',
        toolCalls: [{ id: 'c1' }],
      }),
    ).toBe(true);
  });

  it('only replays tool-turn reasoning when the request has no tools', () => {
    expect(
      shouldReplayAssistantReasoning(false, {
        reasoning: '最终轮推理',
      }),
    ).toBe(false);
    expect(
      shouldReplayAssistantReasoning(false, {
        reasoning: '工具轮推理',
        toolCalls: [{ id: 'c1' }],
      }),
    ).toBe(true);
  });

  it('detects orphan tool results in canonical messages', () => {
    expect(() =>
      assertCanonicalToolTranscript([
        { role: 'user', content: 'hi' },
        { role: 'tool', toolCallId: 'missing', content: '{}' },
      ]),
    ).toThrow(ModelTranscriptIntegrityError);
  });

  it('detects orphan function_call_output in Responses input', () => {
    expect(() =>
      assertResponsesInputToolChain([
        { type: 'message', role: 'user', content: 'hi' },
        { type: 'function_call_output', call_id: 'call-orphan', output: '{}' },
      ]),
    ).toThrow(ModelTranscriptIntegrityError);
  });

  it('accepts a complete tool chain in Responses input', () => {
    expect(() =>
      assertResponsesInputToolChain([
        { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'think' }] },
        { type: 'message', role: 'assistant', content: '' },
        { type: 'function_call', call_id: 'call-1', name: 'web_search', arguments: '{}' },
        { type: 'function_call_output', call_id: 'call-1', output: '{"ok":true}' },
      ]),
    ).not.toThrow();
  });
});
