import { Tokenizer } from '@huggingface/tokenizers';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export class DeepSeekTokenizer {
  private constructor(private readonly tokenizer: Tokenizer) {}

  static async load(directory: string): Promise<DeepSeekTokenizer> {
    const [tokenizer, config] = await Promise.all([
      readFile(join(directory, 'tokenizer.json'), 'utf8').then(JSON.parse),
      readFile(join(directory, 'tokenizer_config.json'), 'utf8').then(JSON.parse),
    ]);
    return new DeepSeekTokenizer(new Tokenizer(tokenizer, config));
  }

  encode(text: string): number[] {
    return [...this.tokenizer.encode(text).ids];
  }

  count(text: string): number {
    return this.encode(text).length;
  }
}
