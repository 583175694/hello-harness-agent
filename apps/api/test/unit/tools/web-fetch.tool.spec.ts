import { describe, expect, it, vi } from 'vitest';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import type { WebFetchService } from '../../../src/web-fetch/web-fetch.service';
import type { SearchService } from '../../../src/search/search.service';
import type { ToolExecutionContext } from '../../../src/tools/agent-tool.types';
import { ToolRunState } from '../../../src/tools/tool-run-state';
import { WebFetchTool } from '../../../src/tools/web-fetch.tool';
import { WebSearchTool } from '../../../src/tools/web-search.tool';

const passage = (id: string, text: string) => ({
  passageId: id,
  text,
  locator: {
    kind: 'web_text' as const,
    quote: { exact: text },
    position: { start: 0, end: Array.from(text).length },
  },
});

describe('WebFetchTool run resources', () => {
  it('skips duplicate input and duplicate content without a top-level tool failure', async () => {
    const text = 'A useful fetched passage with enough detail.';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          results: [
            {
              status: 'succeeded',
              requestedUrl: 'https://example.com/a?id=1',
              finalUrl: 'https://example.com/a?id=1',
              normalizedUrl: 'https://example.com/a?id=1',
              title: 'A',
              contentType: 'text/html',
              retrievedAt: '2026-08-09T00:00:00.000Z',
              contentHash: 'hash-a',
              cacheStatus: 'miss',
              truncated: false,
              passages: [passage('p1', text)],
            },
          ],
        },
        networkAttempts: 1,
      })
      .mockResolvedValueOnce({
        result: {
          results: [
            {
              status: 'succeeded',
              requestedUrl: 'https://mirror.example/a',
              finalUrl: 'https://mirror.example/a',
              normalizedUrl: 'https://mirror.example/a',
              title: 'Mirror',
              contentType: 'text/html',
              retrievedAt: '2026-08-09T00:00:01.000Z',
              contentHash: 'hash-a',
              cacheStatus: 'miss',
              truncated: false,
              passages: [passage('p2', text)],
            },
          ],
        },
        networkAttempts: 1,
      });
    const tool = new WebFetchTool({ fetch } as unknown as WebFetchService);
    const runState = new ToolRunState();
    const context: ToolExecutionContext = {
      toolCallId: 'call-1',
      latestUserContent: 'https://example.com/a?id=1 https://mirror.example/a',
      runState,
    };
    const first = await tool.execute(
      {
        urls: ['https://example.com/a?utm_source=x&id=1', 'https://example.com/a?id=1'],
        query: 'useful detail',
      },
      context,
    );
    expect(first.status).toBe('succeeded');
    if (first.status !== 'succeeded') return;
    expect(first.output.results.map((item) => item.status)).toEqual(['succeeded', 'skipped']);
    expect(first.output.results[1]).toMatchObject({
      code: AGENT_ERROR_CODES.fetchDuplicateSkipped,
    });

    const second = await tool.execute(
      { urls: ['https://mirror.example/a'], query: 'useful detail' },
      { ...context, toolCallId: 'call-2' },
    );
    expect(second.status).toBe('succeeded');
    if (second.status !== 'succeeded') return;
    expect(second.output.results[0]).toMatchObject({
      status: 'skipped',
      code: AGENT_ERROR_CODES.fetchDuplicateSkipped,
    });
    expect(second.output.budget).toMatchObject({
      successfulUniqueDocuments: 1,
      networkAttempts: 2,
    });
    expect(second.logFields).toMatchObject({ URL: '2/25', 网络请求: 1, 唯一文档: 0 });
  });

  it('does not issue a network request for a model-invented URL', async () => {
    const fetch = vi.fn();
    const tool = new WebFetchTool({ fetch } as unknown as WebFetchService);
    const runState = new ToolRunState();
    const context: ToolExecutionContext = {
      toolCallId: 'call-unauthorized',
      latestUserContent: '',
      runState,
    };
    const result = await tool.execute({ urls: ['https://invented.example/article'] }, context);

    expect(fetch).not.toHaveBeenCalled();
    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.output.results[0]).toMatchObject({
      status: 'skipped',
      code: AGENT_ERROR_CODES.fetchUrlNotAllowed,
    });
    expect(result.control).toBeUndefined();

    const stopped = await tool.execute(
      { urls: ['https://invented.example/second'] },
      { ...context, toolCallId: 'call-unauthorized-2' },
    );
    expect(stopped.status).toBe('succeeded');
    if (stopped.status !== 'succeeded') return;
    expect(stopped.control).toEqual({ forceFinalAnswer: true });
  });

  it('shares search-discovered URLs with fetch through the generic run state', async () => {
    const discoveredUrl = 'https://example.com/discovered';
    const search = new WebSearchTool({
      isEnabled: () => true,
      search: vi.fn().mockResolvedValue({
        query: 'market',
        results: [
          {
            title: 'Market report',
            url: discoveredUrl,
            domain: 'example.com',
            snippet: 'A useful report.',
            source: 'test',
          },
        ],
      }),
    } as unknown as SearchService);
    const fetch = vi.fn().mockResolvedValue({
      result: {
        results: [
          {
            status: 'succeeded',
            requestedUrl: discoveredUrl,
            finalUrl: discoveredUrl,
            normalizedUrl: discoveredUrl,
            title: 'Market report',
            contentType: 'text/html',
            retrievedAt: '2026-08-11T00:00:00.000Z',
            contentHash: 'discovered-hash',
            cacheStatus: 'miss',
            truncated: false,
            passages: [passage('p-discovered', 'Relevant market evidence.')],
          },
        ],
      },
      networkAttempts: 1,
    });
    const reader = new WebFetchTool({ fetch } as unknown as WebFetchService);
    const runState = new ToolRunState();
    const context: ToolExecutionContext = {
      toolCallId: 'search-call',
      latestUserContent: 'Analyze the market without a direct URL.',
      runState,
    };

    await search.execute({ query: 'market' }, context);
    const result = await reader.execute(
      { urls: [discoveredUrl], query: 'market' },
      { ...context, toolCallId: 'fetch-call' },
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.output.results[0]).toMatchObject({ status: 'succeeded' });
  });
});
