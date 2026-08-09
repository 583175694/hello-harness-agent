import { describe, expect, it } from 'vitest';

import { ResearchProjectionCollector } from './research-projection.collector';

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
        results: [{
          id: 'source-1',
          title: 'Example',
          url: 'https://example.com/article?b=2&utm_source=search&a=1#summary',
          domain: 'example.com',
          snippet: 'Example source',
        }],
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
        results: [{
          id: 'source-1', title: 'Example', url: 'https://example.com/article',
          domain: 'example.com', snippet: 'Example source',
        }],
      },
    });

    collector.markUsed('Example 这篇文章值得阅读，但回答中没有提供链接。');

    expect(collector.snapshot().sources[0]).toMatchObject({ used: false });
  });
});
