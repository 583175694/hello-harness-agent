import { describe, expect, it } from 'vitest';

import { DeferredToolSearchIndex } from '../../../src/tools/tool-exposure/deferred-tool-search-index';
import type { McpToolCatalogEntry } from '../../../src/mcp/mcp.types';

function catalogEntry(overrides: Partial<McpToolCatalogEntry>): McpToolCatalogEntry {
  return {
    publicName: 'mcp__github__create_issue',
    serverName: 'github',
    rawName: 'create_issue',
    description: 'Create a GitHub issue in a repository',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' }, body: { type: 'string' } },
    },
    defaultApproval: 'auto_execute',
    boundGeneration: 1,
    toolCallTimeoutMs: 60_000,
    exposure: 'deferred',
    ...overrides,
  };
}

describe('DeferredToolSearchIndex', () => {
  it('ranks BM25 matches for English queries', () => {
    const index = new DeferredToolSearchIndex([
      catalogEntry({}),
      catalogEntry({
        publicName: 'mcp__calendar__create_event',
        serverName: 'calendar',
        rawName: 'create_event',
        description: 'Create calendar event with attendees',
        parameters: { type: 'object', properties: { summary: { type: 'string' } } },
      }),
    ]);
    const hits = index.search('create calendar event', 4);
    expect(hits[0]?.entry.publicName).toBe('mcp__calendar__create_event');
  });

  it('promotes exact publicName match to the first result', () => {
    const index = new DeferredToolSearchIndex([
      catalogEntry({}),
      catalogEntry({
        publicName: 'mcp__db__run_query',
        serverName: 'db',
        rawName: 'run_query',
        description: 'Execute SQL',
        parameters: { type: 'object' },
      }),
    ]);
    const hits = index.search('mcp__db__run_query', 3);
    expect(hits[0]?.entry.publicName).toBe('mcp__db__run_query');
  });

  it('matches Chinese descriptions in queries', () => {
    const index = new DeferredToolSearchIndex([
      catalogEntry({
        publicName: 'mcp__ding__send_message',
        serverName: 'ding',
        rawName: 'send_message',
        description: '发送钉钉群消息',
        parameters: { type: 'object', properties: { text: { type: 'string' } } },
      }),
    ]);
    const hits = index.search('钉钉', 3);
    expect(hits[0]?.entry.publicName).toBe('mcp__ding__send_message');
  });

  it('returns fallback listing when BM25 finds nothing', () => {
    const index = new DeferredToolSearchIndex([catalogEntry({})]);
    const hits = index.search('zzzznomatch', 3);
    expect(hits).toHaveLength(0);
    const fallback = index.fallbackListing();
    expect(fallback.some((item) => item.name === 'mcp__github__create_issue')).toBe(true);
  });
});
