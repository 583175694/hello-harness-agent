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

  it('does not leak internal tool-control outcomes into provider messages', () => {
    const adapter = new OpenAICompatibleModelAdapter(new ConfigService());
    expect(
      (adapter as unknown as { toProviderMessages: (messages: unknown[]) => unknown[] }).toProviderMessages([
        {
          role: 'tool',
          content: '{"ok":true}',
          toolCallId: 'call-1',
          controlOutcome: 'approved_by_user',
        },
      ]),
    ).toEqual([{ role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' }]);
  });
});
