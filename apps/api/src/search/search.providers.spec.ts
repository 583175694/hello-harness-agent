import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BochaSearchProvider } from './bocha-search.provider';
import { SerperSearchProvider } from './serper-search.provider';

function config(values: Record<string, string>): ConfigService {
  return { getOrThrow: vi.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('search providers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests ten summarized Bocha results and normalizes safe URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { webPages: { value: [
        { name: 'Result', url: 'https://www.example.com/page#section', summary: 'Detailed summary', siteName: 'Example' },
        { name: 'Unsafe', url: 'javascript:alert(1)', snippet: 'ignored' },
      ] } },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new BochaSearchProvider(config({
      BOCHA_SEARCH_URL: 'https://api.bocha.test/search',
      BOCHA_SEARCH_API_KEY: 'secret',
    }));

    const result = await provider.search({ query: 'agent frameworks' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.bocha.test/search', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer secret' }),
      body: JSON.stringify({ query: 'agent frameworks', count: 10, freshness: 'noLimit', summary: true }),
    }));
    expect(result.results).toEqual([
      expect.objectContaining({ url: 'https://www.example.com/page', domain: 'example.com', snippet: 'Detailed summary' }),
    ]);
  });

  it('maps at most ten Serper organic results', async () => {
    const organic = Array.from({ length: 12 }, (_, index) => ({
      title: `Result ${index}`, link: `https://example.com/${index}`, snippet: `Snippet ${index}`,
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organic }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new SerperSearchProvider(config({
      SERPER_SEARCH_URL: 'https://serper.test/search',
      SERPER_SEARCH_API_KEY: 'secret',
    }));

    const result = await provider.search({ query: 'agent frameworks' });
    expect(result.results).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledWith('https://serper.test/search', expect.objectContaining({
      headers: expect.objectContaining({ 'x-api-key': 'secret' }),
      body: JSON.stringify({ q: 'agent frameworks', num: 10 }),
    }));
  });
});
