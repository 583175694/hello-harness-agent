import { Tokenizer } from '@huggingface/tokenizers';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEEPSEEK_V3_TOKENIZER_RESOURCE_HASHES = {
  'tokenizer.json': 'ecb6f9fc369894346f0511f4074ca75cee5cd5f3b06d02f1ba35fcd39f8e121d',
  'tokenizer_config.json': '144a6d92b6012baeb4f2ac41d48ed3458e758f977a0fb5caf75ff07698fc844c',
} as const;

// Tokenizer 资源约 7.8 MB，读取、哈希、JSON 解析和 native 初始化在进程内只允许执行一次。
// 缓存 Promise 可以合并并发首次加载；资源随包发布且运行期不可变，失败也保持稳定失败。
let tokenizerSingleton: Promise<DeepSeekTokenizer> | undefined;

export class DeepSeekTokenizer {
  private constructor(private readonly tokenizer: Tokenizer) {}

  static async load(): Promise<DeepSeekTokenizer> {
    tokenizerSingleton ??= this.loadVerifiedResources();
    return tokenizerSingleton;
  }

  private static async loadVerifiedResources(): Promise<DeepSeekTokenizer> {
    const resourceRoot = join(dirname(fileURLToPath(import.meta.url)), '../resources');
    const [tokenizerSource, configSource] = await Promise.all([
      readVerifiedResource(resourceRoot, 'tokenizer.json'),
      readVerifiedResource(resourceRoot, 'tokenizer_config.json'),
    ]);
    return new DeepSeekTokenizer(
      new Tokenizer(JSON.parse(tokenizerSource), JSON.parse(configSource)),
    );
  }

  encode(text: string): number[] {
    return [...this.tokenizer.encode(text, { add_special_tokens: false }).ids];
  }

  count(text: string): number {
    return this.encode(text).length;
  }
}

async function readVerifiedResource(
  root: string,
  name: keyof typeof DEEPSEEK_V3_TOKENIZER_RESOURCE_HASHES,
): Promise<string> {
  const body = await readFile(join(root, name));
  const actual = createHash('sha256').update(body).digest('hex');
  const expected = DEEPSEEK_V3_TOKENIZER_RESOURCE_HASHES[name];
  if (actual !== expected)
    throw new Error(`DeepSeek tokenizer resource hash mismatch: ${name}:${actual}`);
  return body.toString('utf8');
}
