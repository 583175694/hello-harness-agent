import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';

import {
  DEFAULT_MODEL_ID,
  MODEL_CATALOG,
  getConfiguredModel,
  getDefaultModel,
} from '../../../src/model/model-catalog';
import { PublicModelConfigController } from '../../../src/model/public-model-config.controller';

describe('model catalog', () => {
  it('declares DeepSeek V4 Flash and Pro without storing credentials', () => {
    expect(MODEL_CATALOG.map((model) => model.id)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
    expect(MODEL_CATALOG.every((model) => model.baseUrl === 'https://api.deepseek.com')).toBe(true);
    expect(JSON.stringify(MODEL_CATALOG)).not.toMatch(/api.?key|secret/i);
  });

  it('resolves the selected default and model ids case-insensitively', () => {
    expect(getDefaultModel().id).toBe(DEFAULT_MODEL_ID);
    expect(getConfiguredModel('DeepSeek-V4-Pro')?.id).toBe('deepseek-v4-pro');
    expect(getConfiguredModel('unknown-model')).toBeUndefined();
  });

  it('publishes an explicitly verified provider context profile for baseline gating', () => {
    const controller = new PublicModelConfigController(
      {
        profile: () => ({
          provider: 'deepseek',
          reasoning: { supported: true, levels: ['off', 'high'], default: 'high' },
        }),
      } as never,
      new ConfigService({
        DEEPSEEK_CONTEXT_WINDOW_TOKENS: 131_072,
        DEEPSEEK_MAX_OUTPUT_TOKENS: 8_192,
        DEEPSEEK_MODEL_PROFILE_SOURCE: 'provider-console-2026-08-15',
        DEEPSEEK_MODEL_PROFILE_VERIFIED: true,
      }),
    );
    expect(controller.getPublicConfig().models[0]?.context).toEqual({
      contextWindowTokens: 131_072,
      maxOutputTokens: 8_192,
      tokenizer: 'deepseek-v3',
      source: 'provider-console-2026-08-15',
      verified: true,
    });
  });
});
