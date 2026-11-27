import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { BatchPassageBudgeter } from '../../../src/web-fetch/batch-passage.budgeter';
import { CrawleeWebContentFetcher } from '../../../src/web-fetch/crawlee-web-content.fetcher';
import { DocumentNormalizer } from '../../../src/web-fetch/document.normalizer';
import { DocumentQualityGate } from '../../../src/web-fetch/document-quality.gate';
import { HtmlContentExtractor } from '../../../src/web-fetch/html-content.extractor';
import { PassageChunker } from '../../../src/web-fetch/passage.chunker';
import { PassageRanker } from '../../../src/web-fetch/passage.ranker';
import { PdfContentExtractor } from '../../../src/web-fetch/pdf-content.extractor';
import { WebFetchCache } from '../../../src/web-fetch/web-fetch.cache';
import { WEB_FETCH_POLICY } from '../../../src/web-fetch/web-fetch.constants';
import { WebFetchService } from '../../../src/web-fetch/web-fetch.service';
import { WebFetchUrlGuard } from '../../../src/web-fetch/web-fetch-url.guard';
import type { GuardedWebUrl, RankedWebPassage } from '../../../src/web-fetch/web-fetch.types';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

// 构造最小有效 PDF 1.4 字节流，供单元测试本地验证 pdf-parse 链路。
function buildSimplePdfBuffer(pages: string[], title?: string): Buffer {
  const escapePdfText = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const objects: string[] = [];
  const pageCount = pages.length;
  const kids = Array.from({ length: pageCount }, (_v, idx) => `${4 + idx * 2} 0 R`).join(' ');
  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`;
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  for (let i = 0; i < pageCount; i += 1) {
    const pageObjId = 4 + i * 2;
    const contentObjId = 5 + i * 2;
    const streamBody = pages[i]!.trim()
      ? `BT\n/F1 12 Tf\n72 720 Td\n(${escapePdfText(pages[i]!)}) Tj\nET\n`
      : '';
    objects[pageObjId] =
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`;
    objects[contentObjId] =
      `${contentObjId} 0 obj\n<< /Length ${Buffer.byteLength(streamBody, 'latin1')} >>\nstream\n${streamBody}endstream\nendobj\n`;
  }
  const infoObjId = 4 + pageCount * 2;
  if (title) {
    objects[infoObjId] = `${infoObjId} 0 obj\n<< /Title (${escapePdfText(title)}) >>\nendobj\n`;
  }
  const header = '%PDF-1.4\n';
  const chunks: Buffer[] = [Buffer.from(header, 'latin1')];
  const offsets: number[] = [0];
  let offset = chunks[0]!.byteLength;
  const maxObjId = title ? infoObjId : 3 + pageCount * 2;
  for (let id = 1; id <= maxObjId; id += 1) {
    offsets[id] = offset;
    const buf = Buffer.from(objects[id]!, 'latin1');
    chunks.push(buf);
    offset += buf.byteLength;
  }
  const xrefStart = offset;
  const xrefLines = [
    `xref\n0 ${maxObjId + 1}\n`,
    '0000000000 65535 f \n',
    ...Array.from(
      { length: maxObjId },
      (_v, idx) => `${String(offsets[idx + 1]!).padStart(10, '0')} 00000 n \n`,
    ),
    `trailer\n<< /Size ${maxObjId + 1} /Root 1 0 R${title ? ` /Info ${infoObjId} 0 R` : ''} >>\nstartxref\n${xrefStart}\n%%EOF\n`,
  ];
  chunks.push(Buffer.from(xrefLines.join(''), 'latin1'));
  return Buffer.concat(chunks);
}

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
    const guard = {
      validate: vi.fn(async (url: string) => ({
        requestedUrl: url,
        normalizedUrl: url,
        url: new URL(url),
      })),
    } as unknown as WebFetchUrlGuard;
    const fetcher = new CrawleeWebContentFetcher(guard);
    const targets: GuardedWebUrl[] = ['/ok', '/json'].map((path) => ({
      requestedUrl: `${baseUrl}${path}`,
      normalizedUrl: `${baseUrl}${path}`,
      url: new URL(`${baseUrl}${path}`),
    }));
    const result = await fetcher.fetchAll(targets);
    expect(result.results[0]).toMatchObject({
      status: 'succeeded',
      content: { body: '公开网页正文' },
    });
    expect(result.results[1]).toMatchObject({
      status: 'succeeded',
      content: { body: '{"hidden":"data"}', contentType: 'application/json' },
    });
  });

  it('revalidates redirects and limits redirect chains', async () => {
    const baseUrl = await fixtureServer((request, response) => {
      response.writeHead(302, { location: `${baseUrl}/target` });
      response.end();
    });
    const guard = {
      validate: vi.fn(async (url: string) => ({
        requestedUrl: url,
        normalizedUrl: url,
        url: new URL(url),
      })),
    } as unknown as WebFetchUrlGuard;
    const fetcher = new CrawleeWebContentFetcher(guard);
    const result = await fetcher.fetchAll([
      {
        requestedUrl: `https://127.0.0.1:${new URL(baseUrl).port}/start`,
        normalizedUrl: `${baseUrl}/start`,
        url: new URL(`${baseUrl}/start`),
      },
    ]);
    expect(result.results[0]).toMatchObject({
      status: 'failed',
      code: AGENT_ERROR_CODES.fetchRedirectNotAllowed,
    });
    expect(guard.validate).toHaveBeenCalled();
  });

  it('counts each recoverable transport retry as a separate network attempt', async () => {
    let requestCount = 0;
    const baseUrl = await fixtureServer((_request, response) => {
      requestCount += 1;
      if (requestCount === 1) {
        response.writeHead(500, { 'content-type': 'text/plain' });
        response.end('temporary failure');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('public article body');
    });
    const guard = {
      validate: vi.fn(async (url: string) => ({
        requestedUrl: url,
        normalizedUrl: url,
        url: new URL(url),
      })),
    } as unknown as WebFetchUrlGuard;
    const fetcher = new CrawleeWebContentFetcher(guard);
    const result = await fetcher.fetchAll([
      {
        requestedUrl: `${baseUrl}/retry`,
        normalizedUrl: `${baseUrl}/retry`,
        url: new URL(`${baseUrl}/retry`),
      },
    ]);

    expect(result.results[0]).toMatchObject({ status: 'succeeded' });
    expect(result.networkAttemptCount).toBe(2);
    expect(requestCount).toBe(2);
  });

  it('fetches application/pdf and %PDF- octet-stream while rejecting non-PDF binaries and oversized PDFs', async () => {
    const pdfBytes = buildSimplePdfBuffer(['First page content for Crawlee PDF fetch test.']);
    const oversizedBytes = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'ascii'),
      Buffer.alloc(WEB_FETCH_POLICY.maxPdfResponseBytes + 1024, 0x20),
    ]);
    const baseUrl = await fixtureServer((request, response) => {
      if (request.url === '/paper.pdf') {
        response.writeHead(200, { 'content-type': 'application/pdf' });
        response.end(pdfBytes);
        return;
      }
      if (request.url === '/download.pdf') {
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        response.end(pdfBytes);
        return;
      }
      if (request.url === '/fake.pdf') {
        response.writeHead(200, { 'content-type': 'application/pdf' });
        response.end(Buffer.from('<html>not a pdf</html>', 'utf8'));
        return;
      }
      if (request.url === '/huge.pdf') {
        response.writeHead(200, {
          'content-type': 'application/pdf',
          'content-length': String(oversizedBytes.byteLength),
        });
        response.end(oversizedBytes);
        return;
      }
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      response.end(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    });
    const guard = {
      validate: vi.fn(async (url: string) => ({
        requestedUrl: url,
        normalizedUrl: url,
        url: new URL(url),
      })),
    } as unknown as WebFetchUrlGuard;
    const fetcher = new CrawleeWebContentFetcher(guard);
    const paths = ['/paper.pdf', '/download.pdf', '/fake.pdf', '/huge.pdf', '/binary.zip'];
    const result = await fetcher.fetchAll(
      paths.map((path) => ({
        requestedUrl: `${baseUrl}${path}`,
        normalizedUrl: `${baseUrl}${path}`,
        url: new URL(`${baseUrl}${path}`),
      })),
    );
    expect(result.results[0]).toMatchObject({
      status: 'succeeded',
      content: { contentType: 'application/pdf' },
    });
    if (result.results[0]?.status === 'succeeded') {
      expect(Buffer.isBuffer(result.results[0].content.rawBuffer)).toBe(true);
    }
    expect(result.results[1]).toMatchObject({
      status: 'succeeded',
      content: { contentType: 'application/pdf' },
    });
    expect(result.results[2]).toMatchObject({
      status: 'failed',
      code: AGENT_ERROR_CODES.fetchUnsupportedContentType,
    });
    expect(result.results[3]).toMatchObject({
      status: 'failed',
      code: AGENT_ERROR_CODES.fetchResponseTooLarge,
    });
    expect(result.results[4]).toMatchObject({
      status: 'failed',
      code: AGENT_ERROR_CODES.fetchUnsupportedContentType,
    });
  });
});

describe('content extraction and passage selection', () => {
  it('extracts structured Markdown and produces Unicode-safe locators', () => {
    const extractor = new HtmlContentExtractor();
    const normalizer = new DocumentNormalizer();
    const chunker = new PassageChunker();
    const ranker = new PassageRanker();
    const extracted = extractor.extract(
      `<!doctype html><html lang="zh-CN"><head>
      <title>产业报告</title><meta property="article:published_time" content="2026-08-01" />
      </head><body><nav>导航噪声</nav><article><h1>产业落地</h1>
      <p>企业正在把生成式 AI 😀 应用于客服、研发和知识管理。</p>
      <table><tr><th>场景</th><th>状态</th></tr><tr><td>客服</td><td>生产</td></tr></table>
      <script>ignore me</script></article></body></html>`,
      'https://example.com/report',
    );
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
        requestedUrl: 'https://example.com',
        finalUrl: 'https://example.com',
        contentType: 'text/plain',
        body: '',
        retrievedAt: '2026-08-08T02:00:00.000Z',
      },
      extracted: { markdown: '苹果种植需要充足日照。' },
      normalizedUrl: 'https://example.com',
    });
    expect(ranker.rank(document, chunker.chunk(document), '量子计算芯片', 0)).toEqual([]);
  });

  it('matches mixed CJK+English queries via Latin tokens and falls back on pure cross-script queries', () => {
    const normalizer = new DocumentNormalizer();
    const chunker = new PassageChunker();
    const ranker = new PassageRanker();
    const document = normalizer.normalize({
      fetched: {
        requestedUrl: 'https://example.com/paper',
        finalUrl: 'https://example.com/paper',
        contentType: 'text/plain',
        body: '',
        retrievedAt: '2026-11-25T00:00:00.000Z',
      },
      extracted: {
        title: 'Attention Paper',
        markdown:
          '# Introduction\n\nThis paper analyzes Transformer attention scaling laws across long contexts.\n\n' +
          '## Experiments\n\nWe evaluate retrieval accuracy on multi-hop benchmarks.',
      },
      normalizedUrl: 'https://example.com/paper',
    });
    const blocks = chunker.chunk(document);

    const mixed = ranker.rankForFetch(document, blocks, 'Transformer attention 原理', 0);
    expect(mixed.passageSelection).toBe('query_matched');
    expect(mixed.passages.length).toBeGreaterThan(0);
    expect(mixed.passages[0]?.passage.text).toContain('Transformer attention');

    const crossScript = ranker.rankForFetch(document, blocks, '深度学习注意力机制研究综述', 0);
    expect(crossScript.passageSelection).toBe('fallback_excerpt');
    expect(crossScript.passages.length).toBeGreaterThan(0);
    expect(crossScript.passages[0]?.score).toBe(WEB_FETCH_POLICY.fallbackExcerptScore);

    const sameScriptUnrelated = ranker.rankForFetch(
      document,
      blocks,
      'xkcd qqqz vvvv',
      0,
    );
    expect(sameScriptUnrelated.passages).toEqual([]);
  });
});

describe('PdfContentExtractor', () => {
  it('extracts paginated text, truncates beyond maxPdfPages, and rejects scanned empty PDFs', async () => {
    const extractor = new PdfContentExtractor();
    const validPdf = buildSimplePdfBuffer(
      [
        'Page one introduces Transformer architecture and retrieval grounding.',
        'Page two presents experimental results on public benchmarks.',
      ],
      'Harness PDF Title',
    );
    const extracted = await extractor.extract(validPdf, 'https://example.com/docs/report.pdf');
    expect(extracted.title).toBe('Harness PDF Title');
    expect(extracted.truncated).toBeUndefined();
    expect(extracted.markdown).toContain('[[page:1]]');
    expect(extracted.markdown).toContain('Transformer architecture');
    expect(extracted.markdown).toContain('[[page:2]]');

    const overLimitPages = Array.from(
      { length: WEB_FETCH_POLICY.maxPdfPages + 2 },
      (_v, idx) => `Page ${idx + 1} synthetic PDF body.`,
    );
    const longPdf = buildSimplePdfBuffer(overLimitPages);
    const truncated = await extractor.extract(longPdf, 'https://example.com/long.pdf');
    expect(truncated.truncated).toBe(true);
    expect(truncated.markdown).toContain(`[[page:${WEB_FETCH_POLICY.maxPdfPages}]]`);
    expect(truncated.markdown).not.toContain(`[[page:${WEB_FETCH_POLICY.maxPdfPages + 1}]]`);

    const emptyPdf = buildSimplePdfBuffer(['']);
    await expect(extractor.extract(emptyPdf, 'https://example.com/scanned.pdf')).rejects.toMatchObject({
      code: AGENT_ERROR_CODES.fetchContentEmpty,
    });
  });
});

describe('DocumentQualityGate', () => {
  const normalize = (markdown: string, title = 'Example') =>
    new DocumentNormalizer().normalize({
      fetched: {
        requestedUrl: 'https://example.com',
        finalUrl: 'https://example.com',
        contentType: 'text/plain',
        body: '',
        retrievedAt: '2026-08-09T00:00:00.000Z',
      },
      extracted: { markdown, title },
      normalizedUrl: 'https://example.com',
    });

  it.each([
    ['Please sign in to continue. '.repeat(20), 'Sign in', AGENT_ERROR_CODES.fetchAccessBlocked],
    [
      'Please enable JavaScript to continue. '.repeat(20),
      'JavaScript required',
      AGENT_ERROR_CODES.fetchJsRenderRequired,
    ],
  ])('rejects unusable shell content', (markdown, title, code) => {
    expect(() => new DocumentQualityGate().validate(normalize(markdown, title))).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('accepts a normal short article above the minimum useful length', () => {
    const document = normalize(
      '这是一篇包含实际正文的公开文章，用于说明产品能力、使用限制和具体实现方式。'.repeat(8),
    );
    expect(() => new DocumentQualityGate().validate(document)).not.toThrow();
  });

  it('allows 600-char real abstracts containing incidental sign-in chrome without blocking', () => {
    const body = [
      '登入 | 注册',
      '本研究分析了大语言模型在长上下文检索中的证据边界与拒答机制，重点探讨了跨语种片段筛选问题。',
      '实验表明，当工具返回仅包含标题与有限摘要时，显式区分已证实事实与推理假设可显著降低幻觉率。',
      '此外，通过对多份公开行业白皮书与技术报告的对比评估，我们验证了结构化证据标识在通用任务中的稳定性。',
      '本文提出的检索增强与片段降级策略已在实际生产链路完成集成，适用于多种垂直与通用信息查询场景。',
      'Sign in to save this paper to your personal reading list or export BibTeX citation metadata.',
    ].join('\n');
    const document = normalize(
      body.repeat(2),
      'Grounding Boundaries in Long-Context Retrieval',
    );
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
    const total = [...selected.values()]
      .flat()
      .reduce((sum, item) => sum + Array.from(item.passage.text).length, 0);
    expect(total).toBeLessThanOrEqual(10_000);
  });

  it('prioritizes higher-scored matched documents over fallback_excerpt documents under tight budget', () => {
    const makeDocPassage = (documentIndex: number, score: number, text: string): RankedWebPassage => ({
      passage: {
        passageId: `doc-${documentIndex}`,
        text,
        locator: {
          kind: 'web_text',
          quote: { exact: text },
          position: { start: 0, end: text.length },
        },
      },
      score,
      documentIndex,
      passageIndex: 0,
    });
    const fallbackText = 'F'.repeat(1_500);
    const matchedText = 'M'.repeat(1_500);
    const selected = new BatchPassageBudgeter().select(
      [
        [makeDocPassage(0, WEB_FETCH_POLICY.fallbackExcerptScore, fallbackText)],
        [makeDocPassage(1, 0.85, matchedText)],
      ],
      1_600,
    );
    expect(selected.has(1)).toBe(true);
    expect(selected.has(0)).toBe(false);
  });
});

describe('WebFetchService', () => {
  it('deduplicates equivalent URLs only within the current call', async () => {
    const guard = new WebFetchUrlGuard(async () => [{ address: '93.184.216.34', family: 4 }]);
    const fetchAll = vi.fn(async (targets: GuardedWebUrl[]) => ({
      networkAttemptCount: targets.length,
      results: targets.map((target) => ({
        status: 'succeeded' as const,
        content: {
          requestedUrl: target.requestedUrl,
          finalUrl: target.normalizedUrl,
          contentType: 'text/plain',
          body: 'This public article contains enough useful original text for passage extraction.'.repeat(
            8,
          ),
          retrievedAt: '2026-08-08T02:00:00.000Z',
        },
      })),
    }));
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

    const first = await service.fetch({
      urls: ['https://example.com/article#first', 'https://example.com/article#second'],
    });
    const second = await service.fetch({ urls: ['https://example.com/article'] });

    expect(first.result.results.map((item) => item.status)).toEqual(['succeeded', 'skipped']);
    expect(first.networkAttempts).toBe(1);
    expect(second.result.results[0]).toMatchObject({ status: 'succeeded', cacheStatus: 'hit' });
    expect(fetchAll).toHaveBeenCalledOnce();
  });

  it('preserves partial success order and reuses cached normalized documents', async () => {
    const guard = new WebFetchUrlGuard(async () => [{ address: '93.184.216.34', family: 4 }]);
    const fetchAll = vi.fn(async (targets: GuardedWebUrl[]) => ({
      networkAttemptCount: targets.length,
      results: targets.map((target, index) =>
        index === 1
          ? {
              status: 'failed' as const,
              requestedUrl: target.requestedUrl,
              code: 'FETCH_TIMEOUT',
              detail: '网页读取超时。',
            }
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
      ),
    }));
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

  it('passes JSON API bodies through the normalizer and ranker pipeline', async () => {
    const guard = new WebFetchUrlGuard(async () => [{ address: '93.184.216.34', family: 4 }]);
    const jsonBody = JSON.stringify({
      title: '生成式 AI 产业报告',
      summary: '企业正在把生成式 AI 应用于客服、研发和知识管理，落地案例持续增加。',
      sections: Array.from({ length: 8 }, (_v, index) => ({
        name: `场景${index + 1}`,
        detail: '生成式 AI 客服与研发助手已在多个行业进入生产环境。',
      })),
    });
    const fetchAll = vi.fn(async (targets: GuardedWebUrl[]) => ({
      networkAttemptCount: targets.length,
      results: targets.map((target) => ({
        status: 'succeeded' as const,
        content: {
          requestedUrl: target.requestedUrl,
          finalUrl: target.normalizedUrl,
          contentType: 'application/json',
          body: jsonBody,
          retrievedAt: '2026-08-08T02:00:00.000Z',
        },
      })),
    }));
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
    const result = await service.fetch({
      urls: ['https://api.example.com/report'],
      query: '生成式 AI 客服',
    });
    expect(result.result.results[0]).toMatchObject({
      status: 'succeeded',
      contentType: 'application/json',
    });
    const succeeded = result.result.results[0];
    if (succeeded?.status !== 'succeeded') throw new Error('expected succeeded');
    expect(succeeded.passages.length).toBeGreaterThan(0);
    expect(succeeded.passages[0]?.text).toContain('生成式 AI');
  });

  it('extracts PDF payloads end-to-end and marks cross-script fallback_excerpt in WebFetchService', async () => {
    const guard = new WebFetchUrlGuard(async () => [{ address: '93.184.216.34', family: 4 }]);
    const pdfBuffer = buildSimplePdfBuffer([
      'This public PDF technical report explains attention mechanisms in language models.',
      'Section two evaluates multi-hop retrieval accuracy and grounding across datasets.',
      'Section three concludes that explicit evidence boundaries reduce hallucination.',
    ]);
    const fetchAll = vi.fn(async (targets: GuardedWebUrl[]) => ({
      networkAttemptCount: targets.length,
      results: targets.map((target) => ({
        status: 'succeeded' as const,
        content: {
          requestedUrl: target.requestedUrl,
          finalUrl: target.normalizedUrl,
          contentType: 'application/pdf',
          body: '',
          rawBuffer: pdfBuffer,
          retrievedAt: '2026-11-25T00:00:00.000Z',
        },
      })),
    }));
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
      new PdfContentExtractor(),
    );

    const response = await service.fetch({
      urls: ['https://example.com/whitepaper.pdf'],
      query: '大模型注意力机制技术白皮书',
    });
    const item = response.result.results[0];
    if (item?.status !== 'succeeded') throw new Error(`unexpected failure: ${JSON.stringify(item)}`);
    expect(item.status).toBe('succeeded');
    expect(item.contentType).toBe('application/pdf');
    expect(item.passageSelection).toBe('fallback_excerpt');
    expect(item.passages.length).toBeGreaterThan(0);
    expect(item.passages[0]?.text).toContain('attention mechanisms');
  });

  it('falls back to main/body extraction for non-article HTML, matches multi-term Chinese queries, and falls back for JSON', () => {
    const extractor = new HtmlContentExtractor();
    const extracted = extractor.extract(
      '<html><head><title>行情看板</title></head><body><div><span>行业板块</span><span>+2.1%</span></div></body></html>',
      'https://example.com/board',
    );
    expect(extracted.title).toBe('行情看板');
    expect(extracted.markdown).toContain('行业板块');

    const normalizer = new DocumentNormalizer();
    const chunker = new PassageChunker();
    const ranker = new PassageRanker();

    const cnDoc = normalizer.normalize({
      fetched: {
        requestedUrl: 'https://example.com/cn',
        finalUrl: 'https://example.com/cn',
        contentType: 'text/plain',
        body: '',
        retrievedAt: '2026-11-27T00:00:00.000Z',
      },
      extracted: { markdown: '今日上午软件服务行业板块表现活跃。' },
      normalizedUrl: 'https://example.com/cn',
    });
    const cnRanked = ranker.rankForFetch(
      cnDoc,
      chunker.chunk(cnDoc),
      '行业板块 涨幅 排行 涨跌家数 主力净流入 概念',
      0,
    );
    expect(cnRanked.passages.length).toBeGreaterThan(0);

    const jsonDoc = normalizer.normalize({
      fetched: {
        requestedUrl: 'https://example.com/api.json',
        finalUrl: 'https://example.com/api.json',
        contentType: 'application/json',
        body: '',
        retrievedAt: '2026-11-27T00:00:00.000Z',
      },
      extracted: { markdown: '{"rc":0,"data":{"diff":[{"f14":"上证指数"}]}}' },
      normalizedUrl: 'https://example.com/api.json',
    });
    const jsonRanked = ranker.rankForFetch(jsonDoc, chunker.chunk(jsonDoc), '涨跌幅 排行', 0);
    expect(jsonRanked.passageSelection).toBe('fallback_excerpt');
    expect(jsonRanked.passages.length).toBeGreaterThan(0);
  });
});
