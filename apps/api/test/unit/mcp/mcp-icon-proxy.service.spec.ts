import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { McpIconProxyService } from '../../../src/mcp/mcp-icon-proxy.service';

describe('McpIconProxyService', () => {
  const service = new McpIconProxyService();
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('decodes allowed data URI png', async () => {
    const result = await service.resolve(`data:image/png;base64,${pngBase64}`);
    expect(result.mimeType).toBe('image/png');
    expect(result.body.length).toBeGreaterThan(0);
  });

  it('accepts windows ico favicon bytes', async () => {
    const icoHeader = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]);
    const pngBody = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const ico = Buffer.concat([icoHeader, pngBody]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://agent.tinyfish.ai/favicon.ico',
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/x-icon' : null) },
      arrayBuffer: async () => Uint8Array.from(ico).buffer,
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await service.resolve('https://agent.tinyfish.ai/favicon.ico');
      expect(result.mimeType).toBe('image/x-icon');
      expect(result.body.length).toBe(ico.length);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects javascript scheme', async () => {
    try {
      await service.resolve('javascript:alert(1)');
      expect.unreachable('expected reject');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as { detail?: string };
      expect(response.detail).toMatch(/不允许/);
    }
  });
});
