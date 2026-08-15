import { describe, expect, it } from 'vitest';
import { DeepSeekTokenizer } from '../src/index.js';

describe('DeepSeekTokenizer', () => {
  it('loads the bundled verified resources and produces stable token ids', async () => {
    const tokenizer = await DeepSeekTokenizer.load();
    expect(tokenizer.encode('Hello!')).toEqual([19923, 3]);
    expect(tokenizer.count('Hello!')).toBe(2);
  });

  it('strongly caches one tokenizer instance across concurrent and later loads', async () => {
    const [first, second, third] = await Promise.all([
      DeepSeekTokenizer.load(),
      DeepSeekTokenizer.load(),
      DeepSeekTokenizer.load(),
    ]);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(await DeepSeekTokenizer.load()).toBe(first);
  });
});
