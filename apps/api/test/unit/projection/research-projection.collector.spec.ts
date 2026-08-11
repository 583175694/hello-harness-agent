import { describe, expect, it } from 'vitest';

import { ResearchProjectionCollector } from '../../../src/projection/research-projection.collector';

describe('ResearchProjectionCollector', () => {
  it('marks a source used after normalizing URLs mentioned in the final answer', () => {
    const collector = new ResearchProjectionCollector();
    collector.recordSearchCompleted({
      toolCallId: 'search-1',
      query: 'test',
      completedAt: '2026-08-09T10:00:00.000Z',
      durationMs: 10,
      result: {
        query: 'test',
        provider: 'serp',
        results: [
          {
            id: 'source-1',
            title: 'Example',
            url: 'https://example.com/article?b=2&utm_source=search&a=1#summary',
            domain: 'example.com',
            snippet: 'Example source',
          },
        ],
      },
    });

    collector.markUsed('参考 [Example](https://example.com/article?a=1&b=2&utm_medium=answer)。');

    expect(collector.snapshot().sources[0]).toMatchObject({ kind: 'clue', used: true });
  });

  it('does not mark a source used when only its title is mentioned', () => {
    const collector = new ResearchProjectionCollector();
    collector.recordSearchCompleted({
      toolCallId: 'search-1',
      query: 'test',
      completedAt: '2026-08-09T10:00:00.000Z',
      durationMs: 10,
      result: {
        query: 'test',
        provider: 'serp',
        results: [
          {
            id: 'source-1',
            title: 'Example',
            url: 'https://example.com/article',
            domain: 'example.com',
            snippet: 'Example source',
          },
        ],
      },
    });

    collector.markUsed('Example 这篇文章值得阅读，但回答中没有提供链接。');

    expect(collector.snapshot().sources[0]).toMatchObject({ used: false });
  });

  it('derives user, search and model provenance from events rather than tool decisions', () => {
    const userUrl = 'https://user.example/article';
    const searchUrl = 'https://search.example/article';
    const modelUrl = 'https://model.example/article';
    const collector = new ResearchProjectionCollector([userUrl]);
    collector.recordSearchCompleted({
      toolCallId: 'search-1',
      query: 'test',
      completedAt: '2026-08-09T10:00:00.000Z',
      durationMs: 10,
      result: {
        query: 'test',
        provider: 'serp',
        results: [
          {
            id: 'search-source',
            title: 'Search source',
            url: searchUrl,
            domain: 'search.example',
            snippet: 'Search source',
          },
        ],
      },
    });
    recordFetch(collector, 'fetch-user', userUrl, 'hash-user');
    recordFetch(collector, 'fetch-search', searchUrl, 'hash-search');
    recordFetch(collector, 'fetch-model', modelUrl, 'hash-model');
    collector.recordSearchCompleted({
      toolCallId: 'search-after-fetch',
      query: 'late discovery',
      completedAt: '2026-08-09T10:00:02.000Z',
      durationMs: 10,
      result: {
        query: 'late discovery',
        provider: 'serp',
        results: [
          {
            id: 'late-source',
            title: 'Late source',
            url: modelUrl,
            domain: 'model.example',
            snippet: 'Discovered after the fetch.',
          },
        ],
      },
    });

    expect(collector.snapshot().sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestedUrl: userUrl, provenance: 'user_provided' }),
        expect.objectContaining({ requestedUrl: searchUrl, provenance: 'search_clue' }),
        expect.objectContaining({ requestedUrl: modelUrl, provenance: 'model_proposed' }),
      ]),
    );
  });

  it('preserves every execution while merging URL and hash collisions into the first source', () => {
    const collector = new ResearchProjectionCollector();
    recordFetch(collector, 'fetch-a', 'https://example.com/a', 'hash-a');
    recordFetch(collector, 'fetch-b', 'https://example.com/b', 'hash-b');
    recordFetch(collector, 'fetch-merge', 'https://example.com/a', 'hash-b', 'Latest title');

    const snapshot = collector.snapshot();
    expect(snapshot.executions).toHaveLength(3);
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0]).toMatchObject({
      title: 'Latest title',
      contentHash: 'hash-b',
      toolCallIds: ['fetch-a', 'fetch-b', 'fetch-merge'],
    });
  });
});

// 记录一个最小但协议完整的成功 Fetch，复用 canonical merge 场景。
function recordFetch(
  collector: ResearchProjectionCollector,
  toolCallId: string,
  url: string,
  contentHash: string,
  title = 'Fetched source',
): void {
  collector.recordFetchCompleted({
    toolCallId,
    toolInput: { urls: [url] },
    completedAt: '2026-08-09T10:00:01.000Z',
    durationMs: 20,
    result: {
      results: [
        {
          status: 'succeeded',
          requestedUrl: url,
          finalUrl: url,
          normalizedUrl: url,
          title,
          contentType: 'text/html',
          retrievedAt: '2026-08-09T10:00:01.000Z',
          contentHash,
          cacheStatus: 'miss',
          truncated: false,
          passages: [
            {
              passageId: `${toolCallId}-passage`,
              text: 'original text',
              locator: {
                kind: 'web_text',
                quote: { exact: 'original text' },
                position: { start: 0, end: 13 },
              },
            },
          ],
        },
      ],
      stats: {
        requestedCount: 1,
        networkAttemptCount: 1,
        succeededCount: 1,
        failedCount: 0,
        skippedCount: 0,
        passageCount: 1,
        passageCharacterCount: 13,
        cacheHitCount: 0,
      },
    },
  });
}
