import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { BatchPassageBudgeter } from './batch-passage.budgeter';
import { CrawleeWebContentFetcher } from './crawlee-web-content.fetcher';
import { DocumentNormalizer } from './document.normalizer';
import { DocumentQualityGate } from './document-quality.gate';
import { HtmlContentExtractor } from './html-content.extractor';
import { PassageChunker } from './passage.chunker';
import { PassageRanker } from './passage.ranker';
import { WebFetchCache } from './web-fetch.cache';
import { WEB_FETCH_POLICY } from './web-fetch.constants';
import { WebFetchService } from './web-fetch.service';
import { WebFetchUrlGuard } from './web-fetch-url.guard';
import type { GuardedWebUrl, RankedWebPassage } from './web-fetch.types';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

// 创建监听随机本地端口的静态测试服务，不依赖真实互联网。
async function fixtureServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败');
  return `http://127.0.0.1:${address.port}`;
}

describe('WebFetchUrlGuard', () => {
  it('accepts public DNS results and normalizes fragments', async () => {
    const guard = new WebFetchUrlGuard(async () => [{ address: '93.184.216.34', family: 4 }]);
    const result = await guard.validate('https://Example.com:443/path#section');
    expect(result.normalizedUrl).toBe('https://example.com/path');
  });

  it('rejects credentials, localhost and mixed private DNS answers', async () => {
    const mixed = new WebFetchUrlGuard(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.8', family: 4 },
    ]);
    await expect(mixed.validate('https://example.com')).rejects.toMatchObject({
      code: AGENT_ERROR_CODES.fetchPrivateAddress,
    });
    await expect(mixed.validate('http://user:pass@example.com')).rejects.toMatchObject({
      code: AGENT_ERROR_CODES.fetchUrlNotAllowed,
    });
    await expect(mixed.validate('http://localhost')).rejects.toMatchObject({
      code: AGENT_ERROR_CODES.fetchPrivateAddress,
    });
    await expect(mixed.validate('http://[::ffff:127.0.0.1]')).rejects.toMatchObject({
      code: AGENT_ERROR_CODES.fetchPrivateAddress,
    });
  });
});

describe('CrawleeWebContentFetcher', () => {
  it('collects per-url success and unsupported content without persistent storage', async () => {
    const baseUrl = await fixtureServer((request, response) => {
      if (request.url === '/ok') {
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('公开网页正文');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"hidden":"data"}');
    });
    const guard = { validate: vi.fn(async (url: string) => ({
      requestedUrl: url,
      normalizedUrl: url,
      url: new URL(url),
    })) } as unknown as WebFetchUrlGuard;
    const fetcher = new CrawleeWebContentFetcher(guard);
    const targets: GuardedWebUrl[] = ['/ok', '/json'].map((path) => ({
      requestedUrl: `${baseUrl}${path}`,
      normalizedUrl: `${baseUrl}${path}`,
      url: new URL(`${baseUrl}${path}`),
    }));
    const result = await fetcher.fetchAll(targets);
    expect(result[0]).toMatchObject({ status: 'succeeded', content: { body: '公开网页正文' } });
    expect(result[1]).toMatchObject({
      status: 'failed',
      code: AGENT_ERROR_CODES.fetchUnsupportedContentType,
    });
  });

  it('revalidates redirects and limits redirect chains', async () => {
    const baseUrl = await fixtureServer((request, response) => {
      response.writeHead(302, { location: `${baseUrl}/target` });
      response.end();
    });
    const guard = { validate: vi.fn(async (url: string) => ({
      requestedUrl: url,
      normalizedUrl: url,
      url: new URL(url),
    })) } as unknown as WebFetchUrlGuard;
    const fetcher = new CrawleeWebContentFetcher(guard);
    const result = await fetcher.fetchAll([{
      requestedUrl: `https://127.0.0.1:${new URL(baseUrl).port}/start`,
      normalizedUrl: `${baseUrl}/start`,
      url: new URL(`${baseUrl}/start`),
    }]);
    expect(result[0]).toMatchObject({
      status: 'failed',
      code: AGENT_ERROR_CODES.fetchRedirectNotAllowed,
    });
    expect(guard.validate).toHaveBeenCalled();
  });
});

describe('content extraction and passage selection', () => {
  it('extracts structured Markdown and produces Unicode-safe locators', () => {
    const extractor = new HtmlContentExtractor();
    const normalizer = new DocumentNormalizer();
    const chunker = new PassageChunker();
    const ranker = new PassageRanker();
    const extracted = extractor.extract(`<!doctype html><html lang="zh-CN"><head>
      <title>产业报告</title><meta property="article:published_time" content="2026-08-01" />
      </head><body><nav>导航噪声</nav><article><h1>产业落地</h1>
      <p>企业正在把生成式 AI 😀 应用于客服、研发和知识管理。</p>
      <table><tr><th>场景</th><th>状态</th></tr><tr><td>客服</td><td>生产</td></tr></table>
      <script>ignore me</script></article></body></html>`, 'https://example.com/report');
    const document = normalizer.normalize({
      fetched: {
        requestedUrl: 'https://example.com/report',
        finalUrl: 'https://example.com/report',
        contentType: 'text/html',
        body: '',
        retrievedAt: '2026-08-08T02:00:00.000Z',
      },
      extracted,
      normalizedUrl: 'https://example.com/report',
    });
    const ranked = ranker.rank(document, chunker.chunk(document), '生成式 AI 客服', 0);
    expect(document.markdown).toContain('| 场景 | 状态 |');
    expect(document.markdown).not.toContain('ignore me');
    expect(ranked.length).toBeGreaterThan(0);
    for (const item of ranked) {
      const { start, end } = item.passage.locator.position;
      expect(Array.from(document.markdown).slice(start, end).join('')).toBe(item.passage.text);
      expect(item.passage.locator.quote.exact).toBe(item.passage.text);
    }
  });

  it('does not serialize missing parent headings as null section path entries', () => {
    const normalizer = new DocumentNormalizer();
    const document = normalizer.normalize({
      fetched: {
        requestedUrl: 'https://example.com/report',
        finalUrl: 'https://example.com/report',
        contentType: 'text/html',
        body: '',
        retrievedAt: '2026-08-08T02:00:00.000Z',
      },
      extracted: {
        markdown: '## 企业客服案例\n\n生成式 AI 已用于客服自动化。',
        title: '企业客服案例',
      },
      normalizedUrl: 'https://example.com/report',
    });
    expect(document.blocks[0]?.sectionPath).toEqual(['企业客服案例']);
    expect(JSON.stringify(document.blocks)).not.toContain('null');
  });

  it('returns no passage for unrelated queries', () => {
    const normalizer = new DocumentNormalizer();
    const chunker = new PassageChunker();
    const ranker = new PassageRanker();
    const document = normalizer.normalize({
      fetched: {
        requestedUrl: 'https://example.com', finalUrl: 'https://example.com',
        contentType: 'text/plain', body: '', retrievedAt: '2026-08-08T02:00:00.000Z',
      },
      extracted: { markdown: '苹果种植需要充足日照。' },
      normalizedUrl: 'https://example.com',
    });
    expect(ranker.rank(document, chunker.chunk(document), '量子计算芯片', 0)).toEqual([]);
  });
});

describe('DocumentQualityGate', () => {
  const normalize = (markdown: string, title = 'Example') => new DocumentNormalizer().normalize({
    fetched: {
      requestedUrl: 'https://example.com', finalUrl: 'https://example.com',
      contentType: 'text/plain', body: '', retrievedAt: '2026-08-09T00:00:00.000Z',
    },
    extracted: { markdown, title },
    normalizedUrl: 'https://example.com',
  });

  it.each([
    ['Please sign in to continue. '.repeat(20), 'Sign in', AGENT_ERROR_CODES.fetchAccessBlocked],
    ['Please enable JavaScript to continue. '.repeat(20), 'JavaScript required', AGENT_ERROR_CODES.fetchJsRenderRequired],
  ])('rejects unusable shell content', (markdown, title, code) => {
    expect(() => new DocumentQualityGate().validate(normalize(markdown, title)))
      .toThrowError(expect.objectContaining({ code }));
  });

  it('accepts a normal short article above the minimum useful length', () => {
    const document = normalize('这是一篇包含实际正文的公开文章，用于说明产品能力、使用限制和具体实现方式。'.repeat(8));
    expect(() => new DocumentQualityGate().validate(document)).not.toThrow();
  });
});

describe('BatchPassageBudgeter', () => {
  it('keeps source diversity and enforces the 24000-character batch limit', () => {
    const passagesByDocument: RankedWebPassage[][] = Array.from({ length: 5 }, (_, documentIndex) =>
      Array.from({ length: 6 }, (_, passageIndex) => {
        const text = String(documentIndex).repeat(WEB_FETCH_POLICY.maxPassageCharacters);
        return {
          passage: {
            passageId: `${documentIndex}-${passageIndex}`,
            text,
            locator: {
              kind: 'web_text' as const,
              quote: { exact: text },
              position: {
                start: passageIndex * WEB_FETCH_POLICY.maxPassageCharacters,
                end: (passageIndex + 1) * WEB_FETCH_POLICY.maxPassageCharacters,
              },
            },
          },
          score: 1 - passageIndex / 10,
          documentIndex,
          passageIndex,
        };
      }),
    );
    const selected = new BatchPassageBudgeter().select(passagesByDocument, 10_000);
    expect(selected.size).toBe(5);
    const total = [...selected.values()].flat()
      .reduce((sum, item) => sum + Array.from(item.passage.text).length, 0);
    expect(total).toBeLessThanOrEqual(10_000);
  });
});

describe('WebFetchService', () => {
  it('preserves partial success order and reuses cached normalized documents', async () => {
    const guard = new WebFetchUrlGuard(async () => [{ address: '93.184.216.34', family: 4 }]);
    const fetchAll = vi.fn(async (targets: GuardedWebUrl[]) => targets.map((target, index) =>
      index === 1
        ? { status: 'failed' as const, requestedUrl: target.requestedUrl, code: 'FETCH_TIMEOUT', detail: '网页读取超时。' }
        : {
            status: 'succeeded' as const,
            content: {
              requestedUrl: target.requestedUrl,
              finalUrl: target.normalizedUrl,
              contentType: 'text/plain',
              body: '生成式 AI 正在进入客服和研发生产场景。'.repeat(12),
              retrievedAt: '2026-08-08T02:00:00.000Z',
            },
          },
    ));
    const service = new WebFetchService(
      guard,
      { fetchAll } as unknown as CrawleeWebContentFetcher,
      new WebFetchCache(),
      new HtmlContentExtractor(),
      new DocumentNormalizer(),
      new DocumentQualityGate(),
      new PassageChunker(),
      new PassageRanker(),
      new BatchPassageBudgeter(),
    );
    const input = {
      urls: ['https://example.com/a', 'https://example.com/b'],
      query: '生成式 AI 客服',
    };
    const first = await service.fetch(input);
    expect(first.result.results.map((item) => item.status)).toEqual(['succeeded', 'failed']);
    expect(first.result.results[0]).toMatchObject({ status: 'succeeded', cacheStatus: 'miss' });
    const cached = await service.fetch({ urls: ['https://example.com/a'], query: '研发生产场景' });
    expect(cached.result.results[0]).toMatchObject({ status: 'succeeded', cacheStatus: 'hit' });
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });
});
