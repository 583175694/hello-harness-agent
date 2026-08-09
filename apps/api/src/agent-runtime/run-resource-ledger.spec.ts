import { describe, expect, it } from 'vitest';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { RunResourceLedger } from './run-resource-ledger';

describe('RunResourceLedger', () => {
  it('normalizes tracking URLs and enforces a partial unique URL budget', () => {
    const ledger = new RunResourceLedger(2, 60_000);
    ledger.allowFetchUrls([
      'https://example.com/a?id=1',
      'https://example.com/b',
      'https://example.com/c',
    ]);
    const reservations = ledger.reserveUrls([
      'https://example.com/a?utm_source=test&id=1#section',
      'https://example.com/a?id=1',
      'https://example.com/b',
      'https://example.com/c',
    ]);
    expect(reservations.map((item) => item.status)).toEqual([
      'accepted', 'skipped', 'accepted', 'skipped',
    ]);
    expect(reservations[1]).toMatchObject({
      status: 'skipped', result: { code: AGENT_ERROR_CODES.fetchDuplicateSkipped },
    });
    expect(reservations[3]).toMatchObject({
      status: 'skipped', result: { code: AGENT_ERROR_CODES.fetchBudgetExceeded },
    });
    expect(ledger.budget()).toMatchObject({
      urls: { used: 2, limit: 2, remaining: 0 },
      canFetch: false,
      stopReason: 'url_budget',
    });
  });

  it('deduplicates final aliases and content hashes while tracking network and passage usage', () => {
    const ledger = new RunResourceLedger(25, 10_000);
    ledger.allowFetchUrls(['https://example.com/a', 'https://mirror.example/a']);
    ledger.reserveUrls(['https://example.com/a', 'https://mirror.example/a']);
    ledger.registerNetworkAttempts(2);
    expect(ledger.registerDocument({
      requestedUrl: 'https://example.com/a',
      finalUrl: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
      contentHash: 'same-hash',
    })).toBe(true);
    expect(ledger.registerDocument({
      requestedUrl: 'https://mirror.example/a',
      finalUrl: 'https://mirror.example/a',
      normalizedUrl: 'https://mirror.example/a',
      contentHash: 'same-hash',
    })).toBe(false);
    ledger.registerPassageCharacters(8_500);
    expect(ledger.budget()).toMatchObject({
      successfulUniqueDocuments: 1,
      networkAttempts: 2,
      passages: { usedCharacters: 8_500, remainingCharacters: 1_500 },
      canFetch: false,
      stopReason: 'context_budget',
    });
  });

  it('stops after two consecutive fetches without new documents', () => {
    const ledger = new RunResourceLedger(25, 60_000);
    ledger.registerFetchGain(0);
    expect(ledger.canFetch()).toBe(true);
    ledger.registerFetchGain(0);
    expect(ledger.budget()).toMatchObject({ canFetch: false, stopReason: 'no_new_content' });
  });

  it('only accepts user-provided or search-discovered fetch candidates', () => {
    const ledger = new RunResourceLedger(25, 60_000);
    ledger.allowFetchUrls(['https://example.com/article?utm_source=search&id=1']);

    expect(ledger.reserveUrls([
      'https://example.com/article?id=1#details',
      'https://untrusted.example/invented',
    ])).toEqual([
      { status: 'accepted', requestedUrl: 'https://example.com/article?id=1#details' },
      {
        status: 'skipped',
        result: expect.objectContaining({ code: AGENT_ERROR_CODES.fetchUrlNotAllowed }),
      },
    ]);
  });
});
