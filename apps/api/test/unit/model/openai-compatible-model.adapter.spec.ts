import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  normalizeProviderUsage,
  OpenAICompatibleModelAdapter,
} from '../../../src/model/openai-compatible-model.adapter';

describe('normalizeProviderUsage', () => {
  it('reads DeepSeek cache usage from the provider top-level fields', () => {
    expect(
      normalizeProviderUsage({
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_cache_hit_tokens: 60,
        prompt_cache_miss_tokens: 40,
      }),
    ).toEqual({ promptTokens: 100, completionTokens: 20, cachedTokens: 60 });
  });

  it('keeps the OpenAI-compatible cache field as a fallback', () => {
    expect(
      normalizeProviderUsage({
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 30 },
      }),
    ).toEqual({ promptTokens: 100, completionTokens: 20, cachedTokens: 30 });
  });

  it('does not leak internal tool-control outcomes into provider messages', async () => {
    const adapter = new OpenAICompatibleModelAdapter(new ConfigService());
    await expect(
      (
        adapter as unknown as { toProviderMessages: (messages: unknown[]) => unknown[] }
      ).toProviderMessages([
        {
          role: 'tool',
          content: '{"ok":true}',
          toolCallId: 'call-1',
          controlOutcome: 'approved_by_user',
        },
      ]),
    ).resolves.toEqual([{ role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' }]);
  });
});

describe('OpenAICompatibleModelAdapter Responses API', () => {
  function adapterWithEvents(events: unknown[]) {
    const adapter = new OpenAICompatibleModelAdapter(
      new ConfigService({ OPENAI_API_KEY: 'test-key' }),
    );
    const create = async () =>
      (async function* () {
        for (const event of events) yield event;
      })();
    (adapter as unknown as { client: unknown }).client = {
      responses: { create },
      chat: { completions: { create } },
    };
    return adapter;
  }

  async function collect(adapter: OpenAICompatibleModelAdapter) {
    const events = [];
    for await (const event of adapter.streamRound({
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: '查询天气' }],
      tools: [{ name: 'weather', description: '查询天气', parameters: { type: 'object' } }],
      reasoningEffort: 'low',
    }))
      events.push(event);
    return events;
  }

  it('preserves commentary phase and aggregates a Responses function call', async () => {
    const events = await collect(
      adapterWithEvents([
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { id: 'msg-1', type: 'message', role: 'assistant', phase: 'commentary' },
        },
        {
          type: 'response.output_text.delta',
          output_index: 0,
          item_id: 'msg-1',
          delta: '我先查询。',
        },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: { id: 'msg-1', type: 'message', role: 'assistant', phase: 'commentary' },
        },
        {
          type: 'response.output_item.added',
          output_index: 1,
          item: { id: 'fc-item', type: 'function_call', call_id: 'call-1', name: 'weather', arguments: '' },
        },
        {
          type: 'response.function_call_arguments.delta',
          output_index: 1,
          delta: '{"city":"深圳"}',
        },
        {
          type: 'response.output_item.done',
          output_index: 1,
          item: { id: 'fc-item', type: 'function_call', call_id: 'call-1', name: 'weather', arguments: '{"city":"深圳"}' },
        },
        {
          type: 'response.completed',
          response: { usage: { input_tokens: 20, output_tokens: 8, input_tokens_details: { cached_tokens: 4 } } },
        },
      ]),
    );

    expect(events).toEqual([
      { type: 'text.delta', delta: '我先查询。', blockSequence: 0, phase: 'pending' },
      { type: 'text.phase.completed', blockSequence: 0, phase: 'commentary' },
      {
        type: 'tool_calls.completed',
        calls: [{ id: 'call-1', name: 'weather', arguments: '{"city":"深圳"}', blockSequence: 1, providerIndex: 1 }],
      },
      expect.objectContaining({
        type: 'round.completed',
        finishReason: 'stop',
        usage: expect.objectContaining({ promptTokens: 20, completionTokens: 8, cachedTokens: 4 }),
      }),
    ]);
  });

  it('preserves final_answer on the first text delta', async () => {
    const events = await collect(
      adapterWithEvents([
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { id: 'msg-final', type: 'message', role: 'assistant', phase: 'final_answer' },
        },
        { type: 'response.output_text.delta', output_index: 0, item_id: 'msg-final', delta: '最终回答。' },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: { id: 'msg-final', type: 'message', role: 'assistant', phase: 'final_answer' },
        },
        { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 4 } } },
      ]),
    );
    expect(events.slice(0, 2)).toEqual([{
      type: 'text.delta',
      delta: '最终回答。',
      blockSequence: 0,
      phase: 'pending',
    }, {
      type: 'text.phase.completed',
      blockSequence: 0,
      phase: 'final_answer',
    }]);
  });

  it('uses output_item.done as authoritative when DeepSeek corrects the phase', async () => {
    const events = await collect(
      adapterWithEvents([
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { id: 'msg-1', type: 'message', role: 'assistant', phase: 'final_answer' },
        },
        { type: 'response.output_text.delta', output_index: 0, item_id: 'msg-1', delta: '前置文本' },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: { id: 'msg-1', type: 'message', role: 'assistant', phase: 'commentary' },
        },
        {
          type: 'response.completed',
          response: { usage: { input_tokens: 1, output_tokens: 1 } },
        },
      ]),
    );
    expect(events.slice(0, 2)).toEqual([
      expect.objectContaining({ type: 'text.delta', phase: 'pending', delta: '前置文本' }),
      { type: 'text.phase.completed', blockSequence: 0, phase: 'commentary' },
    ]);
  });
});
