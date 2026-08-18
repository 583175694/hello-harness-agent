import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Tokenizer } from '@huggingface/tokenizers';

export type DeepSeekToolCall = {
  id: string;
  name: string;
  arguments: string;
  type?: string;
};

export type DeepSeekMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: DeepSeekToolCall[] }
  | { role: 'tool'; content: string };

export type TokenEstimatorOptions = {
  maxEntries?: number;
  maxCacheBytes?: number;
  ttlMs?: number;
};

export type TokenizerMetadata = {
  tokenizer: 'deepseek-v3';
  version: string;
  assetSha256: string;
};

type CacheEntry = { value: number; weight: number; expiresAt: number };

const DEFAULT_OPTIONS: Required<TokenEstimatorOptions> = {
  maxEntries: 20_000,
  maxCacheBytes: 128 * 1024 * 1024,
  ttlMs: 24 * 60 * 60 * 1000,
};

const tokenizerJsonUrl = new URL('../assets/tokenizer.json', import.meta.url);
const tokenizerConfigUrl = new URL('../assets/tokenizer_config.json', import.meta.url);
const tokenizerJson = JSON.parse(readFileSync(fileURLToPath(tokenizerJsonUrl), 'utf8')) as object;
const tokenizerConfig = JSON.parse(
  readFileSync(fileURLToPath(tokenizerConfigUrl), 'utf8'),
) as object;
const assetSha256 = createHash('sha256')
  .update(JSON.stringify(tokenizerJson))
  .update(JSON.stringify(tokenizerConfig))
  .digest('hex');

let tokenizerPromise: Promise<Tokenizer> | undefined;

async function getTokenizer(): Promise<Tokenizer> {
  tokenizerPromise ??= Promise.resolve(new Tokenizer(tokenizerJson, tokenizerConfig));
  return tokenizerPromise;
}

function renderMessages(messages: DeepSeekMessage[], addGenerationPrompt: boolean): string {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => (message.role === 'system' ? message.content : ''))
    .join('\n\n');
  let rendered = '<｜begin▁of▁sentence｜>' + system;
  let hasToolOutput = false;

  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'user') {
      rendered += `<｜User｜>${message.content}`;
      hasToolOutput = false;
      continue;
    }
    if (message.role === 'assistant') {
      if (message.toolCalls?.length) {
        rendered += `<｜Assistant｜>${message.content ?? ''}<｜tool▁calls▁begin｜>`;
        for (const call of message.toolCalls) {
          rendered += `<｜tool▁call▁begin｜>${call.type ?? 'function'}<｜tool▁sep｜>${call.name}\n\`\`\`json\n${call.arguments}\n\`\`\`<｜tool▁call▁end｜>`;
        }
        rendered += '<｜tool▁calls▁end｜><｜end▁of▁sentence｜>';
      } else {
        rendered += `<｜Assistant｜>${message.content ?? ''}<｜end▁of▁sentence｜>`;
      }
      continue;
    }
    if (!hasToolOutput) {
      rendered += '<｜tool▁outputs▁begin｜>';
      hasToolOutput = true;
    }
    rendered += `<｜tool▁output▁begin｜>${message.content}<｜tool▁output▁end｜>`;
  }
  if (hasToolOutput) rendered += '<｜tool▁outputs▁end｜>';
  if (addGenerationPrompt && !hasToolOutput) rendered += '<｜Assistant｜>';
  return rendered;
}

export class DeepSeekV3TokenEstimator {
  private readonly cache = new Map<string, CacheEntry>();
  private cacheBytes = 0;
  private readonly options: Required<TokenEstimatorOptions>;

  readonly metadata: TokenizerMetadata = {
    tokenizer: 'deepseek-v3',
    version: 'deepseek-v3-tokenizer-2025-01',
    assetSha256,
  };

  constructor(options: TokenEstimatorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async countText(text: string): Promise<number> {
    return this.countRendered(text);
  }

  async countMessages(messages: DeepSeekMessage[], addGenerationPrompt = true): Promise<number> {
    return this.countRendered(renderMessages(messages, addGenerationPrompt));
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheBytes = 0;
  }

  private async countRendered(rendered: string): Promise<number> {
    const key = createHash('sha256')
      .update(this.metadata.version)
      .update(this.metadata.assetSha256)
      .update(rendered)
      .digest('hex');
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.value;
    }
    if (cached) this.remove(key, cached);
    const tokenizer = await getTokenizer();
    const value = tokenizer.encode(rendered).ids.length;
    const entry = {
      value,
      weight: Buffer.byteLength(rendered),
      expiresAt: now + this.options.ttlMs,
    };
    this.cache.set(key, entry);
    this.cacheBytes += entry.weight;
    this.evict();
    return value;
  }

  private evict(): void {
    while (
      this.cache.size > this.options.maxEntries ||
      this.cacheBytes > this.options.maxCacheBytes
    ) {
      const first = this.cache.entries().next().value as [string, CacheEntry] | undefined;
      if (!first) return;
      this.remove(first[0], first[1]);
    }
  }

  private remove(key: string, entry: CacheEntry): void {
    this.cache.delete(key);
    this.cacheBytes -= entry.weight;
  }
}

let defaultEstimator: DeepSeekV3TokenEstimator | undefined;

export function getDeepSeekV3TokenEstimator(
  options?: TokenEstimatorOptions,
): DeepSeekV3TokenEstimator {
  defaultEstimator ??= new DeepSeekV3TokenEstimator(options);
  return defaultEstimator;
}

export { renderMessages as renderDeepSeekMessages };
