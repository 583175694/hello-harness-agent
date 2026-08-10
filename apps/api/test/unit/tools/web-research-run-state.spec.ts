import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { describe, expect, it } from 'vitest';

import { WebResearchRunState } from '../../../src/tools/web-research-run-state';

describe('WebResearchRunState', () => {
  it('initializes user URLs, normalizes tracking URLs, and enforces a partial URL budget', () => {
    const state = new WebResearchRunState(
      2,
      60_000,
      'Read https://example.com/a?id=1 and ignore punctuation https://example.com/b.',
    );
    state.allowFetchUrls(['https://example.com/c']);

    const reservations = state.reserveUrls([
      'https://example.com/a?utm_source=test&id=1#section',
      'https://example.com/a?id=1',
      'https://example.com/b',
      'https://example.com/c',
    ]);

    expect(reservations.map((item) => item.status)).toEqual([
      'accepted',
      'skipped',
      'accepted',
      'skipped',
    ]);
    expect(reservations[1]).toMatchObject({
      status: 'skipped',
      result: { code: AGENT_ERROR_CODES.fetchDuplicateSkipped },
    });
    expect(reservations[3]).toMatchObject({
      status: 'skipped',
      result: { code: AGENT_ERROR_CODES.fetchBudgetExceeded },
    });
    expect(state.budget()).toMatchObject({
      urls: { used: 2, limit: 2, remaining: 0 },
      canFetch: false,
      stopReason: 'url_budget',
    });
  });

  it('deduplicates final aliases and content hashes while tracking resource usage', () => {
    const state = new WebResearchRunState(25, 10_000);
    state.allowFetchUrls(['https://example.com/a', 'https://mirror.example/a']);
    state.reserveUrls(['https://example.com/a', 'https://mirror.example/a']);
    state.registerNetworkAttempts(2);

    expect(
      state.registerDocument({
        requestedUrl: 'https://example.com/a',
        finalUrl: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article',
        contentHash: 'same-hash',
      }),
    ).toBe(true);
    expect(
      state.registerDocument({
        requestedUrl: 'https://mirror.example/a',
        finalUrl: 'https://mirror.example/a',
        normalizedUrl: 'https://mirror.example/a',
        contentHash: 'same-hash',
      }),
    ).toBe(false);
    state.registerPassageCharacters(8_500);

    expect(state.budget()).toMatchObject({
      successfulUniqueDocuments: 1,
      networkAttempts: 2,
      passages: { usedCharacters: 8_500, remainingCharacters: 1_500 },
      canFetch: false,
      stopReason: 'context_budget',
    });
  });

  it('stops after two consecutive fetches without new documents', () => {
    const state = new WebResearchRunState(25, 60_000);
    state.registerFetchGain(0);
    expect(state.canFetch()).toBe(true);
    state.registerFetchGain(0);
    expect(state.budget()).toMatchObject({ canFetch: false, stopReason: 'no_new_content' });
  });

  it('rejects URLs that were not supplied by the user or discovered by search', () => {
    const state = new WebResearchRunState(
      25,
      60_000,
      'https://example.com/article?utm_source=user&id=1',
    );

    expect(
      state.reserveUrls([
        'https://example.com/article?id=1#details',
        'https://untrusted.example/invented',
      ]),
    ).toEqual([
      { status: 'accepted', requestedUrl: 'https://example.com/article?id=1#details' },
      {
        status: 'skipped',
        result: expect.objectContaining({ code: AGENT_ERROR_CODES.fetchUrlNotAllowed }),
      },
    ]);
  });
});
