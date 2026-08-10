import { describe, expect, it, vi } from 'vitest';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { RunResourceLedger } from '../../../src/agent-runtime/run-resource-ledger';
import type { WebFetchService } from '../../../src/web-fetch/web-fetch.service';
import { WebFetchTool } from '../../../src/tools/web-fetch.tool';

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
    const fetch = vi.fn()
      .mockResolvedValueOnce({
        result: { results: [{
          status: 'succeeded', requestedUrl: 'https://example.com/a?id=1',
          finalUrl: 'https://example.com/a?id=1', normalizedUrl: 'https://example.com/a?id=1',
          title: 'A', contentType: 'text/html', retrievedAt: '2026-08-09T00:00:00.000Z',
          contentHash: 'hash-a', cacheStatus: 'miss', truncated: false,
          passages: [passage('p1', text)],
        }] },
        networkAttempts: 1,
      })
      .mockResolvedValueOnce({
        result: { results: [{
          status: 'succeeded', requestedUrl: 'https://mirror.example/a',
          finalUrl: 'https://mirror.example/a', normalizedUrl: 'https://mirror.example/a',
          title: 'Mirror', contentType: 'text/html', retrievedAt: '2026-08-09T00:00:01.000Z',
          contentHash: 'hash-a', cacheStatus: 'miss', truncated: false,
          passages: [passage('p2', text)],
        }] },
        networkAttempts: 1,
      });
    const tool = new WebFetchTool({ fetch } as unknown as WebFetchService);
    const resources = new RunResourceLedger(25, 60_000);
    resources.allowFetchUrls([
      'https://example.com/a?id=1',
      'https://mirror.example/a',
    ]);
    const context = { toolCallId: 'call-1', resources };
    const first = await tool.execute({
      urls: ['https://example.com/a?utm_source=x&id=1', 'https://example.com/a?id=1'],
      query: 'useful detail',
    }, context);
    expect(first.status).toBe('succeeded');
    if (first.status !== 'succeeded') return;
    expect(first.output.results.map((item) => item.status)).toEqual(['succeeded', 'skipped']);
    expect(first.output.results[1]).toMatchObject({ code: AGENT_ERROR_CODES.fetchDuplicateSkipped });

    const second = await tool.execute({ urls: ['https://mirror.example/a'], query: 'useful detail' }, {
      toolCallId: 'call-2', resources,
    });
    expect(second.status).toBe('succeeded');
    if (second.status !== 'succeeded') return;
    expect(second.output.results[0]).toMatchObject({
      status: 'skipped', code: AGENT_ERROR_CODES.fetchDuplicateSkipped,
    });
    expect(second.output.budget).toMatchObject({
      successfulUniqueDocuments: 1,
      networkAttempts: 2,
    });
  });

  it('does not issue a network request for a model-invented URL', async () => {
    const fetch = vi.fn();
    const tool = new WebFetchTool({ fetch } as unknown as WebFetchService);
    const result = await tool.execute({ urls: ['https://invented.example/article'] }, {
      toolCallId: 'call-unauthorized',
      resources: new RunResourceLedger(25, 60_000),
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.output.results[0]).toMatchObject({
      status: 'skipped',
      code: AGENT_ERROR_CODES.fetchUrlNotAllowed,
    });
  });
});
