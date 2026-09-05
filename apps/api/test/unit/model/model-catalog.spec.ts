import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  MODEL_CATALOG,
  getConfiguredModel,
  getDefaultModel,
} from '../../../src/model/model-catalog';
import { PublicModelConfigController } from '../../../src/model/public-model-config.controller';

describe('model catalog', () => {
  it('declares supported conversation models without storing credentials', () => {
    expect(MODEL_CATALOG.map((model) => model.id)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'deepseek-v4-flash-vision-exp',
      'qwen3.8-max',
      'qwen3.8-flash',
      'qwen3.7-plus',
      'qwen3.7-max',
      'qwen-plus',
    ]);
    expect(
      MODEL_CATALOG.filter((model) => model.provider === 'bailian').every((model) =>
        model.baseUrl.includes('aliyuncs.com'),
      ),
    ).toBe(true);
    expect(JSON.stringify(MODEL_CATALOG)).not.toMatch(/api.?key|secret/i);
  });

  it('resolves the selected default and model ids case-insensitively', () => {
    expect(getDefaultModel().id).toBe(DEFAULT_MODEL_ID);
    expect(getConfiguredModel('DeepSeek-V4-Pro')?.id).toBe('deepseek-v4-pro');
    expect(getConfiguredModel('unknown-model')).toBeUndefined();
  });

  it('publishes the code-defined provider context profile for baseline gating', () => {
    const controller = new PublicModelConfigController({
      profile: () => ({
        provider: 'deepseek',
        reasoning: { supported: true, levels: ['off', 'high'], default: 'high' },
      }),
    } as never);
    expect(controller.getPublicConfig().models[0]?.context).toEqual({
      contextWindowTokens: 131_072,
      maxOutputTokens: 8_192,
      compactionTriggerTokens: 100_000,
      tokenizer: 'deepseek-v3',
      source: 'https://api-docs.deepseek.com/quick_start/pricing/',
      verified: true,
    });
  });
});
