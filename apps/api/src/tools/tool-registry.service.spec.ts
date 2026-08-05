import { describe, expect, it, vi } from 'vitest';

import { SearchService } from '../search/search.service';
import { ToolRegistryService } from './tool-registry.service';

describe('ToolRegistryService', () => {
  it('hides web_search when no provider is configured', () => {
    const service = new ToolRegistryService({ isEnabled: () => false } as SearchService);
    expect(service.definitions()).toBeUndefined();
  });

  it('rejects unknown tools and invalid arguments without executing search', async () => {
    const search = { isEnabled: () => true, search: vi.fn() };
    const service = new ToolRegistryService(search as unknown as SearchService);
    await expect(service.execute('unknown', '{}')).resolves.toMatchObject({ ok: false, code: 'UNKNOWN_TOOL' });
    await expect(service.execute('web_search', '{bad json')).resolves.toMatchObject({ ok: false, code: 'INVALID_TOOL_ARGUMENTS' });
    expect(search.search).not.toHaveBeenCalled();
  });

  it('validates and executes web_search', async () => {
    const result = { query: 'news', provider: 'serp' as const, results: [] };
    const search = { isEnabled: () => true, search: vi.fn().mockResolvedValue(result) };
    const service = new ToolRegistryService(search as unknown as SearchService);
    await expect(service.execute('web_search', '{"query":" news "}')).resolves.toEqual({
      ok: true, input: { query: 'news' }, result,
    });
  });
});
