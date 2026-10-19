import { describe, expect, it } from 'vitest';

import { mcpToolBusinessSummary } from '../src/tools/mcp-display.js';

describe('mcpToolBusinessSummary', () => {
  it('formats search with query and purpose', () => {
    expect(
      mcpToolBusinessSummary('mcp__tinyfish__search', {
        query: '泰永长征 002927',
        purpose: '了解基本面',
      }),
    ).toBe('search 泰永长征 002927, purpose=了解基本面');
  });

  it('formats fetch_content with purpose', () => {
    expect(
      mcpToolBusinessSummary('mcp__tinyfish__fetch_content', {
        urls: ['https://example.com'],
        purpose: '获取泰永长征实时行情快照',
      }),
    ).toBe('fetch_content 获取泰永长征实时行情快照');
  });
});
