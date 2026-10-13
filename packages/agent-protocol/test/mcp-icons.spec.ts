import { describe, expect, it } from 'vitest';

import {
  mcpServerIconFallbackSrc,
  parseMcpIcons,
  pickMcpIconSrc,
  resolveMcpToolIconSrc,
} from '../src/mcp/icons.js';

describe('mcp icons', () => {
  it('parses valid icon objects only', () => {
    expect(
      parseMcpIcons([
        { src: 'https://example.com/a.png', mimeType: 'image/png' },
        { src: '' },
        null,
      ]),
    ).toHaveLength(1);
  });

  it('prefers png and matching theme', () => {
    const src = pickMcpIconSrc(
      [
        { src: 'javascript:alert(1)' },
        { src: 'https://example.com/dark.webp', theme: 'dark', mimeType: 'image/webp' },
        { src: 'https://example.com/light.png', theme: 'light', mimeType: 'image/png' },
      ],
      { theme: 'light' },
    );
    expect(src).toBe('https://example.com/light.png');
  });

  it('falls back from tool icons to server icons', () => {
    expect(
      resolveMcpToolIconSrc(undefined, [
        { src: 'https://example.com/server.png', mimeType: 'image/png' },
      ]),
    ).toBe('https://example.com/server.png');
  });

  it('provides known server fallback icons', () => {
    expect(mcpServerIconFallbackSrc('tinyfish')).toMatch(/^https:\/\//);
    expect(mcpServerIconFallbackSrc('unknown')).toBeUndefined();
  });
});
