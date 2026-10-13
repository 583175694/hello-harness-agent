import { describe, expect, it } from 'vitest';

import { mcpIconDisplayUrl } from './mcp-icon-display';

describe('mcpIconDisplayUrl', () => {
  it('proxies https icons through the API', () => {
    expect(mcpIconDisplayUrl('https://example.com/icon.png')).toBe(
      '/api/agent/mcp/icon?src=https%3A%2F%2Fexample.com%2Ficon.png',
    );
  });

  it('passes through data URI png', () => {
    const data = 'data:image/png;base64,abc';
    expect(mcpIconDisplayUrl(data)).toBe(data);
  });
});
