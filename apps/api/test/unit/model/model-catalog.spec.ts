import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MODEL_ID,
  MODEL_CATALOG,
  getConfiguredModel,
  getDefaultModel,
} from '../../../src/model/model-catalog';

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
});
