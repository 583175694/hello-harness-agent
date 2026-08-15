import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative } from 'node:path';
import {
  AGENT_ERROR_CODES,
  searchToolResultSchema,
  webFetchItemResultSchema,
  webFetchResultSchema,
} from '@harness/agent-protocol';
import type {
  SearchToolResult,
  WebFetchInput,
  WebFetchItemResult,
  WebFetchResult,
} from '@harness/agent-protocol';
import { z } from 'zod';
import { ENV_KEYS } from '../bootstrap/env.constants';

const manifestSchema = z.object({
  version: z.string().min(1),
  search: z
    .array(
      z.object({
        query: z.string().min(1),
        aliases: z.array(z.string().min(1)).optional(),
        result: searchToolResultSchema,
      }),
    )
    .default([]),
  fetch: z
    .array(
      z.object({
        url: z.string().url(),
        result: webFetchItemResultSchema,
      }),
    )
    .default([]),
  chains: z
    .array(
      z.object({
        urls: z.array(z.string().url()).min(2).max(20),
        finalText: z.string().min(1),
      }),
    )
    .default([]),
});

type Manifest = z.infer<typeof manifestSchema>;

// Eval Fixture 只在进程启动时加载一次；运行期间不会读取任意客户端路径或回退公网。
@Injectable()
export class EvalFixtureStore {
  private readonly manifest?: Manifest;
  readonly hash?: string;
  readonly root?: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const configured = config.get<string>(ENV_KEYS.evalFixtureRoot);
    if (!configured) return;
    if (config.get<string>('NODE_ENV') !== 'test')
      throw new Error('EVAL_FIXTURE_ROOT is only allowed when NODE_ENV=test');
    if (!isAbsolute(configured)) throw new Error('EVAL_FIXTURE_ROOT must be an absolute path');
    const root = realpathSync(configured);
    if (!statSync(root).isDirectory()) throw new Error('EVAL_FIXTURE_ROOT must be a directory');
    const manifestPath = this.safePath(root, 'manifest.json');
    const source = readFileSync(manifestPath, 'utf8');
    this.manifest = manifestSchema.parse(JSON.parse(source));
    this.root = root;
    this.hash = this.hashDirectory(root);
  }

  isEnabled(): boolean {
    return this.manifest !== undefined;
  }

  search(query: string): SearchToolResult {
    const normalized = this.normalizeQuery(query);
    const entry = this.manifest?.search.find((candidate) =>
      [candidate.query, ...(candidate.aliases ?? [])]
        .map((value) => this.normalizeQuery(value))
        .includes(normalized),
    );
    if (!entry) throw new Error(`EVAL_FIXTURE_MISS:search:${normalized}`);
    return structuredClone(entry.result);
  }

  fetch(input: WebFetchInput): { result: WebFetchResult; networkAttempts: number } {
    const results = input.urls.map((requestedUrl): WebFetchItemResult => {
      const normalizedUrl = new URL(requestedUrl).toString();
      const entry = this.manifest?.fetch.find(
        (candidate) => new URL(candidate.url).toString() === normalizedUrl,
      );
      if (entry) return structuredClone(entry.result);
      const chained = this.chainResult(requestedUrl);
      return (
        chained ?? {
          status: 'failed',
          requestedUrl,
          code: AGENT_ERROR_CODES.fetchUpstreamFailed,
          detail: 'EVAL_FIXTURE_MISS',
        }
      );
    });
    const succeeded = results.filter((item) => item.status === 'succeeded');
    const failed = results.filter((item) => item.status === 'failed');
    const skipped = results.filter((item) => item.status === 'skipped');
    const passages = succeeded.flatMap((item) => item.passages);
    const result = webFetchResultSchema.parse({
      ...(input.query ? { query: input.query } : {}),
      results,
      stats: {
        requestedCount: input.urls.length,
        networkAttemptCount: 0,
        succeededCount: succeeded.length,
        failedCount: failed.length,
        skippedCount: skipped.length,
        passageCount: passages.length,
        passageCharacterCount: passages.reduce(
          (total, passage) => total + Array.from(passage.text).length,
          0,
        ),
        cacheHitCount: 0,
      },
    });
    return { result, networkAttempts: 0 };
  }

  private normalizeQuery(value: string): string {
    return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('zh-CN');
  }

  private chainResult(requestedUrl: string): WebFetchItemResult | undefined {
    for (const chain of this.manifest?.chains ?? []) {
      const index = chain.urls.findIndex(
        (url) => new URL(url).toString() === new URL(requestedUrl).toString(),
      );
      if (index < 0) continue;
      const nextUrl = chain.urls[index + 1];
      const text = index === chain.urls.length - 1 ? chain.finalText : `下一步必须读取 ${nextUrl}`;
      const normalizedUrl = new URL(requestedUrl).toString();
      return webFetchItemResultSchema.parse({
        status: 'succeeded',
        requestedUrl,
        finalUrl: normalizedUrl,
        normalizedUrl,
            title: `Eval Chain ${index + 1}/${chain.urls.length}`,
        language: 'zh-CN',
        contentType: 'text/plain',
        retrievedAt: '2026-08-15T00:00:00.000Z',
        contentHash: createHash('sha256').update(text).digest('hex'),
        cacheStatus: 'miss',
        truncated: false,
        passages: [
          {
            passageId: `chain-${String(index + 1).padStart(2, '0')}-p1`,
            text,
            locator: {
              kind: 'web_text',
              quote: { exact: text },
              position: { start: 0, end: Array.from(text).length },
            },
          },
        ],
      });
    }
    return undefined;
  }

  private safePath(root: string, name: string): string {
    const path = normalize(join(root, name));
    const child = relative(root, path);
    if (child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid fixture path');
    return path;
  }

  private hashDirectory(root: string): string {
    const entries: string[] = [];
    const visit = (directory: string, relativeDirectory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        const absolutePath = join(directory, entry.name);
        if (entry.isDirectory()) visit(absolutePath, relativePath);
        else if (entry.isFile()) {
          const digest = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
          entries.push(`${relativePath}\0${digest}`);
        } else throw new Error(`Unsupported fixture entry: ${relativePath}`);
      }
    };
    visit(root, '');
    return createHash('sha256').update(entries.sort().join('\n')).digest('hex');
  }
}
