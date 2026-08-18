import { describe, expect, it } from 'vitest';
import { DeepSeekV3TokenEstimator } from '../src/index';

describe('DeepSeek V3 tokenizer', () => {
  it('counts text with the bundled tokenizer asset', async () => {
    const estimator = new DeepSeekV3TokenEstimator();
    expect(await estimator.countText('Hello!')).toBe(2);
    expect(await estimator.countText('你好')).toBe(1);
  });

  it('renders tool calls and generation prompts deterministically', async () => {
    const estimator = new DeepSeekV3TokenEstimator();
    const withoutPrompt = await estimator.countMessages(
      [
        { role: 'user', content: '查天气' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'call-1', name: 'weather', arguments: '{"city":"上海"}' }],
        },
        { role: 'tool', content: '{"temperature":20}' },
      ],
      false,
    );
    const withPrompt = await estimator.countMessages([{ role: 'user', content: '继续' }], true);
    expect(withoutPrompt).toBeGreaterThan(0);
    expect(withPrompt).toBeGreaterThan(0);
  });

  it('shares the singleton estimator and exposes asset metadata', async () => {
    const first = new DeepSeekV3TokenEstimator();
    const second = new DeepSeekV3TokenEstimator();
    expect(first.metadata.tokenizer).toBe('deepseek-v3');
    expect(first.metadata.assetSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await first.countText('cache')).toBe(await second.countText('cache'));
  });
});
